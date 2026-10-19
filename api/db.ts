import { neon } from '@neondatabase/serverless';

function getUrl(): string {
  return process.env.DATABASE_URL || '';
}

export const sql = (async (strings: TemplateStringsArray | string, ...params: any[]) => {
  const url = getUrl();
  if (!url) {
    throw new Error('DATABASE_URL is not set in environment variables');
  }

  const client = neon(url);
  try {
    return await (client as any)(strings, ...params);
  } catch (err: any) {
    const errMsg = String(err?.message || '');
    const isNetworkErr =
      errMsg.includes('fetch failed') ||
      errMsg.includes('NGHTTP2') ||
      errMsg.includes('ECONNRESET') ||
      err?.sourceError?.code === 'ERR_HTTP2_STREAM_ERROR';

    if (isNetworkErr) {
      console.warn('Neon connection retry after network error:', errMsg);
      await new Promise((r) => setTimeout(r, 250));
      const retryClient = neon(url);
      return await (retryClient as any)(strings, ...params);
    }
    throw err;
  }
}) as any;
