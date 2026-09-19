import { createChatStream, json } from '../lib/openhex.mjs';

export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: '不支持的请求方法。' });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 24_000) {
    return json(413, { error: '请求内容过长。' });
  }

  let input;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 24_000) {
      return json(413, { error: '请求内容过长。' });
    }
    input = JSON.parse(text);
  } catch {
    return json(400, { error: '请求格式不正确。' });
  }

  return (await createChatStream(input, request.signal)).response;
};

export const config = {
  path: '/api/openhex/chat',
};
