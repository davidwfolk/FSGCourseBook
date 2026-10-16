import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Error: DATABASE_URL is not defined in environment variables.');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function initDb() {
  console.log('Connecting to Neon database and initializing PostGIS schema...');
  try {
    console.log('1. Enabling PostGIS extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
    const postgisVer = await sql`SELECT postgis_version();`;
    console.log('   PostGIS enabled:', postgisVer[0]?.postgis_version);

    console.log('2. Creating "courses" table...');
    await sql`
      CREATE TABLE IF NOT EXISTS courses (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        city TEXT,
        state TEXT DEFAULT 'ID',
        center_lat DOUBLE PRECISION NOT NULL,
        center_lon DOUBLE PRECISION NOT NULL,
        osm_raw_r2_key TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `;

    console.log('3. Creating "course_holes" table...');
    await sql`
      CREATE TABLE IF NOT EXISTS course_holes (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
        hole_number INT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
        par INT DEFAULT 4,
        handicap INT,
        yardage INT,
        tee_lat DOUBLE PRECISION NOT NULL,
        tee_lon DOUBLE PRECISION NOT NULL,
        pivot_lat DOUBLE PRECISION,
        pivot_lon DOUBLE PRECISION,
        green_lat DOUBLE PRECISION NOT NULL,
        green_lon DOUBLE PRECISION NOT NULL,
        hole_bearing DOUBLE PRECISION,
        approach_bearing DOUBLE PRECISION,
        green_polygon JSONB,
        bunkers_geojson JSONB DEFAULT '[]'::jsonb,
        fairways_geojson JSONB DEFAULT '[]'::jsonb,
        lidar_r2_key TEXT,
        UNIQUE(course_id, hole_number)
      );
    `;

    console.log('3b. Adding features and lidar_grid columns if missing...');
    await sql`ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;`;
    await sql`ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS lidar_grid JSONB;`;

    console.log('4. Creating "yardage_books" table...');
    await sql`
      CREATE TABLE IF NOT EXISTS yardage_books (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
        title TEXT DEFAULT 'Tournament Plan',
        tee_time TIMESTAMPTZ,
        hole_plans JSONB NOT NULL DEFAULT '{}'::jsonb,
        pdf_r2_key TEXT,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `;

    console.log('Database initialization completed successfully!');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log('Public tables:', tables.map(t => t.table_name).join(', '));
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

initDb();
