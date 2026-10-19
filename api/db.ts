import { neon } from '@neondatabase/serverless';

function getUrl(): string {
  return process.env.DATABASE_URL || '';
}

export const sql = (async (strings: TemplateStringsArray | string, ...params: any[]) => {
  const url = getUrl();
  if (!url) {
    throw new Error('DATABASE_URL is not set in environment variables');
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = neon(url);
      return await (client as any)(strings, ...params);
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      const isNetworkErr =
        errMsg.includes('fetch failed') ||
        errMsg.includes('NGHTTP2') ||
        errMsg.includes('ECONNRESET') ||
        errMsg.includes('ETIMEDOUT') ||
        err?.sourceError?.code === 'ERR_HTTP2_STREAM_ERROR';

      if (isNetworkErr && attempt < 3) {
        console.warn(`Neon connection retry (attempt ${attempt}/3) after network error:`, errMsg);
        await new Promise((r) => setTimeout(r, attempt * 500));
        continue;
      }
      throw err;
    }
  }
}) as any;
