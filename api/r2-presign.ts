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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
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

    if (operation === 'get') {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn });
      const publicUrl = publicBase ? `${publicBase.replace(/\/+$/, '')}/${key}` : signedUrl;
      return res.status(200).json({ url: signedUrl, publicUrl, uploadUrl: null, key, bucket: bucketName, operation: 'get' });
    } else {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn });

      let publicUrl = publicBase ? `${publicBase.replace(/\/+$/, '')}/${key}` : '';
      if (!publicUrl) {
        try {
          const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: key });
          publicUrl = await getSignedUrl(s3, getCmd, { expiresIn: 604800 });
        } catch {
          publicUrl = signedUrl.split('?')[0];
        }
      }

      return res.status(200).json({
        uploadUrl: signedUrl,
        publicUrl,
        url: signedUrl,
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
