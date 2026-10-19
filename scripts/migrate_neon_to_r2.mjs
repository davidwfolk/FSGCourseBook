import { neon } from '@neondatabase/serverless';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

function getEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m) {
        let v = (m[2] || '').trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[m[1]] = v;
      }
    }
  }
  return env;
}

const env = getEnv();
const sql = neon(env.DATABASE_URL);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY
  }
});

async function main() {
  const courseId = '9f5cc226-b2fc-4ca8-969a-0d3d06a811f7';
  const holes = await sql`
    SELECT id, hole_number, lidar_grid 
    FROM course_holes 
    WHERE course_id = ${courseId} AND lidar_grid IS NOT NULL
    ORDER BY hole_number ASC;
  `;

  console.log(`Found ${holes.length} holes with lidar_grid.`);
  const publicBase = (env.R2_PUBLIC_URL || '').trim();

  for (const h of holes) {
    const grid = h.lidar_grid;
    if (!grid) continue;

    // Check if hole has base64 that needs migration to R2
    if (grid.image_base64 && !grid.image_url) {
      const b64Data = grid.image_base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(b64Data, 'base64');
      const fileName = `${courseId}_hole_${h.hole_number}_${Date.now()}.png`;

      console.log(`Uploading Hole ${h.hole_number} image (${buffer.length} bytes) to R2 as ${fileName}...`);

      await s3.send(new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME || 'fsgcoursebook',
        Key: fileName,
        Body: buffer,
        ContentType: 'image/png'
      }));

      const publicUrl = publicBase
        ? `${publicBase.replace(/\/+$/, '')}/${fileName}`
        : `/api/r2-presign?filename=${encodeURIComponent(fileName)}&operation=get&raw=1`;

      grid.image_url = publicUrl;
      delete grid.image_base64;
      delete grid.svg;

      await sql`
        UPDATE course_holes 
        SET lidar_grid = ${grid} 
        WHERE id = ${h.id};
      `;

      console.log(`Hole ${h.hole_number} migrated to R2 URL: ${publicUrl}`);
    } else {
      // Just ensure base64 and svg are purged if image_url exists
      let changed = false;
      if (grid.image_base64 && grid.image_url) {
        delete grid.image_base64;
        changed = true;
      }
      if (grid.svg) {
        delete grid.svg;
        changed = true;
      }
      if (changed) {
        await sql`
          UPDATE course_holes 
          SET lidar_grid = ${grid} 
          WHERE id = ${h.id};
        `;
        console.log(`Hole ${h.hole_number} cleaned up dead base64/svg.`);
      }
    }
  }

  // Check column sizes now
  const updatedRows = await sql`
    SELECT hole_number, pg_column_size(lidar_grid) as sz, lidar_grid->>'image_url' as url 
    FROM course_holes 
    WHERE course_id = ${courseId} 
    ORDER BY hole_number ASC;
  `;
  console.log('Updated Neon course_holes summary:', updatedRows);
}

main().catch(console.error);
