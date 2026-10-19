import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf8');
const match = envContent.match(/DATABASE_URL="([^"]+)"/);
const dbUrl = match ? match[1] : process.env.DATABASE_URL;

const sql = neon(dbUrl);

async function main() {
  const updated = await sql`
    UPDATE course_holes 
    SET lidar_grid = lidar_grid - 'svg' 
    WHERE lidar_grid ? 'svg' 
    RETURNING hole_number;
  `;
  console.log('Stripped svg from holes:', updated.map(r => r.hole_number));

  const rows = await sql`
    SELECT hole_number, pg_column_size(lidar_grid) as sz 
    FROM course_holes 
    WHERE course_id = '9f5cc226-b2fc-4ca8-969a-0d3d06a811f7' 
    ORDER BY hole_number;
  `;
  console.log('Updated column sizes:', rows);
}

main().catch(console.error);
