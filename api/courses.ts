import { sql } from './db';
import { matchOsmHoles, buildFallbackHolesFromGreens } from './osm-matcher';

export default async function handler(req: any, res: any) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
      const courseId = url.searchParams.get('id') || url.searchParams.get('course_id') || req.query?.id;
      const syncOsm = url.searchParams.get('sync_osm') === 'true' || req.query?.sync_osm === 'true';
      const hardReset = url.searchParams.get('hard_reset') === 'true' || 
                        url.searchParams.get('hardReset') === 'true' || 
                        req.query?.hard_reset === 'true' || 
                        req.query?.hardReset === 'true';

      if (courseId) {
        // Fetch single course
        const courseRows = await sql`SELECT * FROM courses WHERE id = ${courseId};`;
        if (courseRows.length === 0) {
          return res.status(404).json({ error: 'Course not found' });
        }
        const course = courseRows[0];

        let holes = await sql`
          SELECT * FROM course_holes 
          WHERE course_id = ${courseId} 
          ORDER BY hole_number ASC;
        `;

        // If holes count is 0, or user requested sync_osm, fetch from Overpass and persist all 18 holes
        if ((holes.length === 0 || syncOsm) && course.center_lat && course.center_lon) {
          try {
            const lat = course.center_lat;
            const lon = course.center_lon;
            const query = `[out:json][timeout:25];(
              way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee|cartpath"](around:2000,${lat},${lon});
              relation["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|green"](around:2000,${lat},${lon});
              way["natural"~"water|wood"](around:2000,${lat},${lon});
              relation["natural"="water"](around:2000,${lat},${lon});
              way["water"](around:2000,${lat},${lon});
              way["waterway"](around:2000,${lat},${lon});
              way["highway"="path"](around:2000,${lat},${lon});
              node["natural"="tree"](around:1200,${lat},${lon});
            );out geom;`;

            const mirrors = [
              'https://overpass-api.de/api/interpreter',
              'https://lz4.overpass-api.de/api/interpreter',
              'https://overpass.kumi.systems/api/interpreter'
            ];

            let osmData: any = null;
            for (const mirror of mirrors) {
              try {
                const resp = await fetch(mirror, {
                  method: 'POST',
                  headers: {
                    'User-Agent': 'FSGCourseBook/3.0 (contact@fullstackgolf.com)',
                    'Content-Type': 'application/x-www-form-urlencoded'
                  },
                  body: 'data=' + encodeURIComponent(query)
                });
                if (resp.ok) {
                  osmData = await resp.json();
                  if (osmData && osmData.elements && osmData.elements.length > 0) break;
                }
              } catch (e) {}
            }

            if (osmData) {
              const matched = matchOsmHoles(osmData, course.name);
              const savedHoles = [];

              if (hardReset || holes.length === 0) {
                // Hard Reset: Explicitly wipe old holes before saving fresh Overpass data
                await sql`DELETE FROM course_holes WHERE course_id = ${course.id};`;
                for (const h of matched.holes) {
                  const hNum = h.hole_number;
                  const holeRow = await sql`
                    INSERT INTO course_holes (
                      course_id, hole_number, par, handicap, yardage,
                      tee_lat, tee_lon, pivot_lat, pivot_lon,
                      green_lat, green_lon, hole_bearing, approach_bearing,
                      green_polygon, bunkers_geojson, fairways_geojson,
                      features, lidar_grid
                    ) VALUES (
                      ${course.id}, ${hNum}, ${h.par || 4}, ${null}, ${h.yardage || 350},
                      ${h.tee_lat}, ${h.tee_lon}, ${h.pivot_lat || null}, ${h.pivot_lon || null},
                      ${h.green_lat}, ${h.green_lon}, ${h.hole_bearing || 0}, ${h.approach_bearing || 0},
                      ${JSON.stringify(h.green_polygon || null)}::jsonb,
                      ${JSON.stringify(h.bunkers_geojson || [])}::jsonb,
                      ${JSON.stringify(h.fairways_geojson || [])}::jsonb,
                      ${JSON.stringify(h.features || [])}::jsonb,
                      ${null}
                    )
                    RETURNING *;
                  `;
                  savedHoles.push(holeRow[0]);
                }
              } else {
                // Soft Merge: Update fairways, bunkers, green_polygon and features; INTENTIONALLY OMIT tee_lat, tee_lon, green_lat, green_lon so manual adjustments survive!
                for (const h of matched.holes) {
                  const hNum = h.hole_number;
                  const holeRow = await sql`
                    INSERT INTO course_holes (
                      course_id, hole_number, par, handicap, yardage,
                      tee_lat, tee_lon, pivot_lat, pivot_lon,
                      green_lat, green_lon, hole_bearing, approach_bearing,
                      green_polygon, bunkers_geojson, fairways_geojson,
                      features, lidar_grid
                    ) VALUES (
                      ${course.id}, ${hNum}, ${h.par || 4}, ${null}, ${h.yardage || 350},
                      ${h.tee_lat}, ${h.tee_lon}, ${h.pivot_lat || null}, ${h.pivot_lon || null},
                      ${h.green_lat}, ${h.green_lon}, ${h.hole_bearing || 0}, ${h.approach_bearing || 0},
                      ${JSON.stringify(h.green_polygon || null)}::jsonb,
                      ${JSON.stringify(h.bunkers_geojson || [])}::jsonb,
                      ${JSON.stringify(h.fairways_geojson || [])}::jsonb,
                      ${JSON.stringify(h.features || [])}::jsonb,
                      ${null}
                    )
                    ON CONFLICT (course_id, hole_number) DO UPDATE
                    SET fairways_geojson = EXCLUDED.fairways_geojson,
                        bunkers_geojson = EXCLUDED.bunkers_geojson,
                        green_polygon = COALESCE(course_holes.green_polygon, EXCLUDED.green_polygon),
                        features = EXCLUDED.features
                    RETURNING *;
                  `;
                  savedHoles.push(holeRow[0]);
                }
              }

              if (savedHoles.length > 0) {
                holes = savedHoles;
              }
            }
          } catch (err) {
            console.warn('Overpass fetch in /api/courses notice:', err);
          }
        }

        const yardageBooks = await sql`
          SELECT * FROM yardage_books 
          WHERE course_id = ${courseId} 
          ORDER BY updated_at DESC LIMIT 1;
        `;

        return res.status(200).json({
          course,
          holes,
          yardage_book: yardageBooks[0] || null
        });
      } else {
        // Fast listing of all courses in Neon
        const courses = await sql`
          SELECT c.*, COUNT(ch.id)::int as holes_count
          FROM courses c
          LEFT JOIN course_holes ch ON c.id = ch.course_id
          GROUP BY c.id
          ORDER BY c.name ASC;
        `;
        return res.status(200).json({ courses });
      }
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { name, city, state, center_lat: inputLat, center_lon: inputLon, osmData, holes: manualHoles, osm_raw_r2_key, hardReset } = body;

      if (!name) {
        return res.status(400).json({ error: 'Course name is required' });
      }

      let holesToSave: any[] = [];
      let finalLat = inputLat;
      let finalLon = inputLon;

      if (osmData && osmData.elements) {
        const matched = matchOsmHoles(osmData, name);
        holesToSave = matched.holes;
        finalLat = finalLat || matched.center_lat;
        finalLon = finalLon || matched.center_lon;
      } else if (Array.isArray(manualHoles) && manualHoles.length > 0) {
        holesToSave = manualHoles;
      }

      if (finalLat === undefined || finalLon === undefined) {
        finalLat = 0;
        finalLon = 0;
      }

      // 1. Upsert course into courses
      const courseRows = await sql`
        INSERT INTO courses (name, city, state, center_lat, center_lon, osm_raw_r2_key)
        VALUES (${name}, ${city || null}, ${state || 'ID'}, ${finalLat}, ${finalLon}, ${osm_raw_r2_key || null})
        ON CONFLICT (name) DO UPDATE 
        SET center_lat = EXCLUDED.center_lat,
            center_lon = EXCLUDED.center_lon,
            city = COALESCE(EXCLUDED.city, courses.city),
            state = COALESCE(EXCLUDED.state, courses.state),
            osm_raw_r2_key = COALESCE(EXCLUDED.osm_raw_r2_key, courses.osm_raw_r2_key)
        RETURNING *;
      `;

      const course = courseRows[0];
      const savedHoles: any[] = [];

      // Explicitly execute DELETE FROM course_holes WHERE course_id = $1 if hardReset is true
      if (holesToSave.length > 0 && hardReset) {
        await sql`DELETE FROM course_holes WHERE course_id = ${course.id};`;
      }

      // 2. Bulk insert holes 1-18 into course_holes
      for (const h of holesToSave) {
        const hNum = parseInt(h.hole_number, 10);
        if (isNaN(hNum) || hNum < 1 || hNum > 18) continue;

        const teeLat = h.tee_lat ?? (h.centerline ? h.centerline[0][1] : finalLat);
        const teeLon = h.tee_lon ?? (h.centerline ? h.centerline[0][0] : finalLon);
        const greenLat = h.green_lat ?? (h.centerline ? h.centerline[h.centerline.length - 1][1] : finalLat);
        const greenLon = h.green_lon ?? (h.centerline ? h.centerline[h.centerline.length - 1][0] : finalLon);

        if (hardReset) {
          const holeRow = await sql`
            INSERT INTO course_holes (
              course_id, hole_number, par, handicap, yardage,
              tee_lat, tee_lon, pivot_lat, pivot_lon,
              green_lat, green_lon, hole_bearing, approach_bearing,
              green_polygon, bunkers_geojson, fairways_geojson, lidar_r2_key,
              features, lidar_grid
            ) VALUES (
              ${course.id}, ${hNum}, ${h.par || 4}, ${h.handicap || null}, ${h.yardage || 400},
              ${teeLat}, ${teeLon}, ${h.pivot_lat || null}, ${h.pivot_lon || null},
              ${greenLat}, ${greenLon}, ${h.hole_bearing || 0}, ${h.approach_bearing || 0},
              ${JSON.stringify(h.green_polygon || null)}::jsonb,
              ${JSON.stringify(h.bunkers_geojson || [])}::jsonb,
              ${JSON.stringify(h.fairways_geojson || [])}::jsonb,
              ${h.lidar_r2_key || null},
              ${JSON.stringify(h.features || [])}::jsonb,
              ${JSON.stringify(h.lidar_grid || h.lidarGrid || null)}::jsonb
            )
            ON CONFLICT (course_id, hole_number) DO UPDATE
            SET par = EXCLUDED.par,
                handicap = COALESCE(EXCLUDED.handicap, course_holes.handicap),
                yardage = EXCLUDED.yardage,
                tee_lat = EXCLUDED.tee_lat,
                tee_lon = EXCLUDED.tee_lon,
                pivot_lat = EXCLUDED.pivot_lat,
                pivot_lon = EXCLUDED.pivot_lon,
                green_lat = EXCLUDED.green_lat,
                green_lon = EXCLUDED.green_lon,
                hole_bearing = EXCLUDED.hole_bearing,
                approach_bearing = EXCLUDED.approach_bearing,
                green_polygon = EXCLUDED.green_polygon,
                bunkers_geojson = EXCLUDED.bunkers_geojson,
                fairways_geojson = EXCLUDED.fairways_geojson,
                lidar_r2_key = COALESCE(EXCLUDED.lidar_r2_key, course_holes.lidar_r2_key),
                features = EXCLUDED.features,
                lidar_grid = EXCLUDED.lidar_grid
            RETURNING *;
          `;
          savedHoles.push(holeRow[0]);
        } else {
          // Soft Merge: Intentionally omit tee_lat, tee_lon, green_lat, green_lon so manual adjustments survive
          const holeRow = await sql`
            INSERT INTO course_holes (
              course_id, hole_number, par, handicap, yardage,
              tee_lat, tee_lon, pivot_lat, pivot_lon,
              green_lat, green_lon, hole_bearing, approach_bearing,
              green_polygon, bunkers_geojson, fairways_geojson, lidar_r2_key,
              features, lidar_grid
            ) VALUES (
              ${course.id}, ${hNum}, ${h.par || 4}, ${h.handicap || null}, ${h.yardage || 400},
              ${teeLat}, ${teeLon}, ${h.pivot_lat || null}, ${h.pivot_lon || null},
              ${greenLat}, ${greenLon}, ${h.hole_bearing || 0}, ${h.approach_bearing || 0},
              ${JSON.stringify(h.green_polygon || null)}::jsonb,
              ${JSON.stringify(h.bunkers_geojson || [])}::jsonb,
              ${JSON.stringify(h.fairways_geojson || [])}::jsonb,
              ${h.lidar_r2_key || null},
              ${JSON.stringify(h.features || [])}::jsonb,
              ${JSON.stringify(h.lidar_grid || h.lidarGrid || null)}::jsonb
            )
            ON CONFLICT (course_id, hole_number) DO UPDATE
            SET fairways_geojson = EXCLUDED.fairways_geojson,
                bunkers_geojson = EXCLUDED.bunkers_geojson,
                green_polygon = COALESCE(course_holes.green_polygon, EXCLUDED.green_polygon),
                features = EXCLUDED.features
            RETURNING *;
          `;
          savedHoles.push(holeRow[0]);
        }
      }

      return res.status(200).json({
        success: true,
        course,
        holesCount: savedHoles.length,
        holes: savedHoles
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error in /api/courses:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
