import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

function getEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const k = match[1];
          let v = (match[2] || '').trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          process.env[k] = v;
        }
      }
    }
  } catch {}
  return process.env[key] || '';
}

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const accountId = getEnv('R2_ACCOUNT_ID');
  const accessKeyId = getEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = getEnv('R2_SECRET_ACCESS_KEY');
  const bucketName = getEnv('R2_BUCKET_NAME') || 'fsgcoursebook';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return res.status(503).json({
      error: 'Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not fully configured in .env',
      configured: {
        accountId: !!accountId,
        accessKeyId: !!accessKeyId,
        secretAccessKey: !!secretAccessKey
      }
    });
  }
  try {
    let body: any = {};
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch {
        body = {};
      }
    } else if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      body = req.body;
    }
    const urlParams = new URL(req.url, `http://${req.headers?.host || 'localhost'}`).searchParams;

    const key = body.key || body.filename || urlParams.get('key') || urlParams.get('filename');
    const contentType = body.contentType || urlParams.get('contentType') || 'image/png';
    const operation = (body.operation || urlParams.get('operation') || 'put').toLowerCase();
    const expiresIn = parseInt(body.expiresIn || urlParams.get('expiresIn') || '3600', 10);

    if (!key) {
      return res.status(400).json({ error: 'Storage "key" or "filename" is required' });
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });

    const publicBase = getEnv('R2_PUBLIC_URL').trim();

    // 1. Direct proxy upload from frontend (bypasses browser CORS restrictions completely)
    if (req.method === 'PUT') {
      const buffer = (req as any).rawBuffer?.length
        ? (req as any).rawBuffer
        : (Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || ''));
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType || 'image/png'
      });
      await s3.send(command);

      const publicUrl = publicBase
        ? `${publicBase.replace(/\/+$/, '')}/${key}`
        : `/api/r2-presign?filename=${encodeURIComponent(key)}&operation=get&raw=1`;

      return res.status(200).json({
        success: true,
        uploadUrl: `/api/r2-presign?filename=${encodeURIComponent(key)}`,
        publicUrl,
        key
      });
    }

    // 2. Fetch raw image stream or presigned GET
    if (operation === 'get') {
      if (urlParams.get('raw') === '1') {
        const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
        const obj = await s3.send(command);
        res.setHeader('Content-Type', obj.ContentType || 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (obj.Body) {
          const stream = obj.Body as any;
          if (typeof stream.pipe === 'function') {
            return stream.pipe(res);
          } else {
            const bytes = await obj.Body.transformToByteArray();
            return res.end(Buffer.from(bytes));
          }
        }
      }
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn });
      const publicUrl = publicBase
        ? `${publicBase.replace(/\/+$/, '')}/${key}`
        : `/api/r2-presign?filename=${encodeURIComponent(key)}&operation=get&raw=1`;
      return res.status(200).json({ url: signedUrl, publicUrl, uploadUrl: null, key, bucket: bucketName, operation: 'get' });
    } else {
      // 3. Generate presigned URLs for upload
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn });

      const localUploadUrl = `/api/r2-presign?filename=${encodeURIComponent(key)}`;
      const publicUrl = publicBase
        ? `${publicBase.replace(/\/+$/, '')}/${key}`
        : `/api/r2-presign?filename=${encodeURIComponent(key)}&operation=get&raw=1`;

      return res.status(200).json({
        uploadUrl: localUploadUrl,
        directUploadUrl: signedUrl,
        publicUrl,
        url: localUploadUrl,
        key,
        bucket: bucketName,
        operation: 'put'
      });
    }
  } catch (error: any) {
    console.error('Error generating R2 presigned URL:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate presigned URL' });
  }
}
