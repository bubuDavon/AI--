import {
  AbortError,
  ApiError,
  OpenhexClient,
  extractText,
} from '@openhex-ai/agent-sdk';

export class ConsultError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = 'ConsultError';
    this.code = code;
    this.status = status;
  }
}

function config() {
  const apiKey = process.env.OPENHEX_OFFICIAL_API_KEY;
  const agentId = process.env.OPENHEX_OFFICIAL_AGENT_ID;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const valid = Boolean(
    apiKey
      && agentId
      && apiKey.length > 40
      && uuid.test(agentId)
      && !apiKey.includes('请替换')
      && !agentId.includes('请替换'),
  );
  if (!valid) throw new ConsultError('service_not_configured');
  return { apiKey, agentId };
}

function mapError(error) {
  if (error instanceof ConsultError) return error;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return new ConsultError('upstream_access_denied', 502);
    if (error.status === 429) return new ConsultError('upstream_rate_limited', 429);
    return new ConsultError('upstream_unavailable', 502);
  }
  if (error instanceof AbortError || error?.name === 'AbortError') {
    return new ConsultError('upstream_timeout', 504);
  }
  return new ConsultError('upstream_unavailable', 502);
}

// 官网咨询返回一次性 JSON；conversationId 由浏览器保存，OpenHex 凭据仍只在服务端。
export async function consultOnce(message, conversationId) {
  const { apiKey, agentId } = config();
  const client = new OpenhexClient({ apiKey, agentId, timeoutMs: 25_000 });
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 52_000);

  try {
    const sent = await client.chat.send(
      conversationId
        ? { message, conversationId }
        : { message, targetAgentIds: [agentId], newConversation: true },
      { signal: controller.signal },
    );
    const chunks = [];
    for await (const record of client.chat.resumeTurn(sent.conversationId, {
      lastEventId: sent.userEventId,
      signal: controller.signal,
      idleTimeoutMs: 50_000,
    })) {
      if (record.sender === 'assistant' || record.sender === 'agent') {
        const text = extractText(record);
        if (text) chunks.push(text);
      }
    }
    const text = chunks.join('').trim();
    if (!text) throw new ConsultError('upstream_empty_reply');
    return { text, conversationId: sent.conversationId };
  } catch (error) {
    throw mapError(error);
  } finally {
    clearTimeout(deadline);
  }
}
