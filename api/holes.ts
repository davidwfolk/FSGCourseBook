import { sql } from './db';

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const {
        course_id,
        hole_number,
        par,
        handicap,
        yardage,
        tee_lat,
        tee_lon,
        pivot_lat,
        pivot_lon,
        green_lat,
        green_lon,
        hole_bearing,
        approach_bearing,
        green_polygon,
        bunkers_geojson,
        fairways_geojson,
        lidar_r2_key,
        features,
        lidar_grid,
        hole_plan,
        hole_plans
      } = body;

      if (!course_id || !hole_number) {
        return res.status(400).json({ error: 'course_id and hole_number (1-18) are required' });
      }

      const hNum = parseInt(hole_number, 10);
      if (isNaN(hNum) || hNum < 1 || hNum > 18) {
        return res.status(400).json({ error: 'hole_number must be between 1 and 18' });
      }

      // Upsert into course_holes
      const updatedHole = await sql`
        INSERT INTO course_holes (
          course_id, hole_number, par, handicap, yardage,
          tee_lat, tee_lon, pivot_lat, pivot_lon,
          green_lat, green_lon, hole_bearing, approach_bearing,
          green_polygon, bunkers_geojson, fairways_geojson, lidar_r2_key,
          features, lidar_grid
        ) VALUES (
          ${course_id}, ${hNum}, ${par || 4}, ${handicap || null}, ${yardage || 400},
          ${tee_lat || 0}, ${tee_lon || 0}, ${pivot_lat || null}, ${pivot_lon || null},
          ${green_lat || 0}, ${green_lon || 0}, ${hole_bearing || 0}, ${approach_bearing || 0},
          ${green_polygon ? JSON.stringify(green_polygon) : null}::jsonb,
          ${JSON.stringify(bunkers_geojson || [])}::jsonb,
          ${JSON.stringify(fairways_geojson || [])}::jsonb,
          ${lidar_r2_key || null},
          ${features ? JSON.stringify(features) : '[]'}::jsonb,
          ${lidar_grid ? JSON.stringify(lidar_grid) : null}::jsonb
        )
        ON CONFLICT (course_id, hole_number) DO UPDATE
        SET par = COALESCE(EXCLUDED.par, course_holes.par),
            handicap = COALESCE(EXCLUDED.handicap, course_holes.handicap),
            yardage = COALESCE(EXCLUDED.yardage, course_holes.yardage),
            tee_lat = CASE WHEN EXCLUDED.tee_lat != 0 THEN EXCLUDED.tee_lat ELSE course_holes.tee_lat END,
            tee_lon = CASE WHEN EXCLUDED.tee_lon != 0 THEN EXCLUDED.tee_lon ELSE course_holes.tee_lon END,
            pivot_lat = COALESCE(EXCLUDED.pivot_lat, course_holes.pivot_lat),
            pivot_lon = COALESCE(EXCLUDED.pivot_lon, course_holes.pivot_lon),
            green_lat = CASE WHEN EXCLUDED.green_lat != 0 THEN EXCLUDED.green_lat ELSE course_holes.green_lat END,
            green_lon = CASE WHEN EXCLUDED.green_lon != 0 THEN EXCLUDED.green_lon ELSE course_holes.green_lon END,
            hole_bearing = COALESCE(EXCLUDED.hole_bearing, course_holes.hole_bearing),
            approach_bearing = COALESCE(EXCLUDED.approach_bearing, course_holes.approach_bearing),
            green_polygon = COALESCE(EXCLUDED.green_polygon, course_holes.green_polygon),
            bunkers_geojson = COALESCE(EXCLUDED.bunkers_geojson, course_holes.bunkers_geojson),
            fairways_geojson = COALESCE(EXCLUDED.fairways_geojson, course_holes.fairways_geojson),
            lidar_r2_key = COALESCE(EXCLUDED.lidar_r2_key, course_holes.lidar_r2_key),
            features = CASE WHEN EXCLUDED.features IS NOT NULL AND jsonb_array_length(EXCLUDED.features) > 0 THEN EXCLUDED.features ELSE course_holes.features END,
            lidar_grid = COALESCE(EXCLUDED.lidar_grid, course_holes.lidar_grid)
        RETURNING *;
      `;

      // Update yardage_books hole_plans if provided
      let savedYardageBook = null;
      if (hole_plan || hole_plans) {
        // Find existing yardage_book for this course or create one
        const existingBooks = await sql`
          SELECT * FROM yardage_books WHERE course_id = ${course_id} ORDER BY updated_at DESC LIMIT 1;
        `;

        let currentPlans: Record<string, any> = {};
        let bookId: string | null = null;
        if (existingBooks.length > 0) {
          bookId = existingBooks[0].id;
          currentPlans = (typeof existingBooks[0].hole_plans === 'object' && existingBooks[0].hole_plans !== null)
            ? existingBooks[0].hole_plans
            : {};
        }

        if (hole_plans) {
          currentPlans = { ...currentPlans, ...hole_plans };
        }
        if (hole_plan) {
          currentPlans[String(hNum)] = hole_plan;
        }

        if (bookId) {
          const resBook = await sql`
            UPDATE yardage_books
            SET hole_plans = ${JSON.stringify(currentPlans)}::jsonb, updated_at = now()
            WHERE id = ${bookId}
            RETURNING *;
          `;
          savedYardageBook = resBook[0];
        } else {
          const resBook = await sql`
            INSERT INTO yardage_books (course_id, hole_plans)
            VALUES (${course_id}, ${JSON.stringify(currentPlans)}::jsonb)
            RETURNING *;
          `;
          savedYardageBook = resBook[0];
        }
      }

      return res.status(200).json({
        success: true,
        hole: updatedHole[0],
        yardage_book: savedYardageBook
      });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
      const courseId = url.searchParams.get('course_id') || req.query?.course_id;
      const holeNumber = url.searchParams.get('hole_number') || req.query?.hole_number;

      if (!courseId) {
        return res.status(400).json({ error: 'course_id is required' });
      }

      if (holeNumber) {
        const rows = await sql`
          SELECT * FROM course_holes 
          WHERE course_id = ${courseId} AND hole_number = ${parseInt(holeNumber, 10)};
        `;
        return res.status(200).json({ hole: rows[0] || null });
      } else {
        const rows = await sql`
          SELECT * FROM course_holes 
          WHERE course_id = ${courseId} 
          ORDER BY hole_number ASC;
        `;
        return res.status(200).json({ holes: rows });
      }
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
      const courseId = url.searchParams.get('course_id') || req.query?.course_id;
      const holeNumber = url.searchParams.get('hole_number') || req.query?.hole_number;
      if (!courseId) {
        return res.status(400).json({ error: 'course_id is required' });
      }
      if (holeNumber) {
        await sql`DELETE FROM course_holes WHERE course_id = ${courseId} AND hole_number = ${parseInt(holeNumber, 10)};`;
      } else {
        await sql`DELETE FROM course_holes WHERE course_id = ${courseId};`;
      }
      return res.status(200).json({ success: true, message: 'Deleted course holes' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in /api/holes:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
