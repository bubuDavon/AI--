import { consultOnce, ConsultError } from '../official/openhex-consult.mjs';

function json(status, body) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function configured() {
  const apiKey = process.env.OPENHEX_OFFICIAL_API_KEY;
  const agentId = process.env.OPENHEX_OFFICIAL_AGENT_ID;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return Boolean(
    apiKey
      && agentId
      && apiKey.length > 40
      && uuid.test(agentId)
      && !apiKey.includes('请替换')
      && !agentId.includes('请替换'),
  );
}

export default async function officialApp(request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.searchParams.get('action') === 'status') {
    return json(200, { configured: configured() });
  }
  if (request.method !== 'POST' || url.searchParams.get('action') !== 'chat') {
    return json(404, { error: 'not_found' });
  }

  const length = Number(request.headers.get('content-length') || 0);
  if (length > 32_000) return json(413, { error: 'body_too_large' });

  let body;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 32_000) return json(413, { error: 'body_too_large' });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  if (!message || message.length > 500) return json(400, { error: 'invalid_message' });
  if (conversationId && !/^[A-Za-z0-9_-]{8,160}$/.test(conversationId)) {
    return json(400, { error: 'invalid_conversation' });
  }

  try {
    const result = await consultOnce(message, conversationId);
    return json(200, { reply: result.text, conversationId: result.conversationId });
  } catch (error) {
    if (error instanceof ConsultError) return json(error.status || 503, { error: error.code });
    console.error('[official-agent]', error);
    return json(503, { error: 'service_unavailable' });
  }
}

export const config = { path: '/api/official' };
