import { getOpenhexConfig, json } from '../lib/openhex.mjs';

export default async (request) => {
  if (request.method !== 'GET') {
    return json(405, { error: '不支持的请求方法。' });
  }
  return json(200, { configured: getOpenhexConfig().configured });
};

export const config = {
  path: '/api/openhex/status',
};
