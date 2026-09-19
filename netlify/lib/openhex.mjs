import {
  AbortError,
  ApiError,
  OpenhexClient,
  extractText,
} from '@openhex-ai/agent-sdk';

export function getOpenhexConfig() {
  const agentId = process.env.OPENHEX_LEARNING_AGENT_ID;
  const apiKey = process.env.OPENHEX_LEARNING_API_KEY;
  const configured = Boolean(
    apiKey && agentId && !apiKey.includes('请替换') && !agentId.includes('请替换'),
  );
  return { agentId, apiKey, configured };
}

export function json(status, body) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function publicError(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'OpenHex 凭据无效或已过期，请检查 Netlify 环境变量。';
    if (error.status === 402) return 'OpenHex 账户积分不足，请先补充积分。';
    if (error.status === 429) return '请求过于频繁，请稍后再试。';
    if (error.status >= 500) return 'OpenHex 服务暂时不可用，请稍后再试。';
    return `OpenHex 请求失败（${error.status}）。`;
  }
  if (error instanceof AbortError || error?.name === 'AbortError') {
    return '本次回答已停止或超过 Netlify 单次执行时间，请缩短问题后重试。';
  }
  return '实时助教暂时无法连接，请稍后再试。';
}

export async function createChatStream(input, requestSignal) {
  const { agentId, apiKey, configured } = getOpenhexConfig();
  if (!configured) {
    return { response: json(503, { error: '服务端尚未配置学习 Agent 的 API Key 和 Agent ID。' }) };
  }

  const message = String(input.message || '').trim();
  const conversationId = String(input.conversationId || '').trim();
  if (!message || message.length > 2000) {
    return { response: json(400, { error: '问题不能为空，且不能超过 2000 个字符。' }) };
  }

  const client = new OpenhexClient({ apiKey, agentId, timeoutMs: 25_000 });
  const abortController = new AbortController();
  const deadline = setTimeout(() => abortController.abort(), 52_000);
  const stopOnDisconnect = () => abortController.abort();
  requestSignal?.addEventListener('abort', stopOnDisconnect, { once: true });

  let sent;
  try {
    sent = await client.chat.send(
      conversationId
        ? { message, conversationId }
        : { message, targetAgentIds: [agentId], newConversation: true },
      { signal: abortController.signal },
    );
  } catch (error) {
    clearTimeout(deadline);
    requestSignal?.removeEventListener('abort', stopOnDisconnect);
    return { response: json(502, { error: publicError(error) }) };
  }

  const encoder = new TextEncoder();
  const write = (controller, record) => {
    controller.enqueue(encoder.encode(`${JSON.stringify(record)}\n`));
  };

  const body = new ReadableStream({
    async start(controller) {
      write(controller, { type: 'meta', conversationId: sent.conversationId });
      try {
        for await (const record of client.chat.resumeTurn(sent.conversationId, {
          lastEventId: sent.userEventId,
          signal: abortController.signal,
          idleTimeoutMs: 50_000,
        })) {
          if (record.sender === 'assistant' || record.sender === 'agent') {
            const text = extractText(record);
            if (text) write(controller, { type: 'delta', text });
          }
        }
        write(controller, { type: 'done', conversationId: sent.conversationId });
      } catch (error) {
        write(controller, { type: 'error', error: publicError(error) });
        console.error('[openhex/netlify]', error);
      } finally {
        clearTimeout(deadline);
        requestSignal?.removeEventListener('abort', stopOnDisconnect);
        controller.close();
      }
    },
    cancel() {
      clearTimeout(deadline);
      abortController.abort();
      requestSignal?.removeEventListener('abort', stopOnDisconnect);
    },
  });

  return {
    response: new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-content-type-options': 'nosniff',
      },
    }),
  };
}
