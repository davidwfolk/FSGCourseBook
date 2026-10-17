import { sql } from './db';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
    const latStr = url.searchParams.get('lat') || req.query?.lat;
    const lonStr = url.searchParams.get('lon') || req.query?.lon;
    const courseId = url.searchParams.get('course_id') || req.query?.course_id;
    const holeNumStr = url.searchParams.get('hole_number') || req.query?.hole_number;

    if (!latStr || !lonStr) {
      return res.status(400).json({ error: 'lat and lon parameters are required' });
    }

    const centerLat = parseFloat(latStr);
    const centerLon = parseFloat(lonStr);
    const holeNum = holeNumStr ? parseInt(holeNumStr, 10) : null;

    // Check Neon cache if courseId and holeNum are provided
    if (courseId && holeNum) {
      try {
        const rows = await sql`
          SELECT lidar_grid FROM course_holes
          WHERE course_id = ${courseId} AND hole_number = ${holeNum};
        `;
        if (rows.length > 0 && rows[0].lidar_grid && Array.isArray(rows[0].lidar_grid.elevations)) {
          return res.status(200).json({ grid: rows[0].lidar_grid, cached: true });
        }
      } catch (e) {}
    }

    // Build 7x7 grid covering a 40x40 yard bounding box
    const gridSize = 7;
    const halfSpanYards = 20;
    const stepYards = (halfSpanYards * 2) / (gridSize - 1);
    const mPerYard = 0.9144;
    const mPerLat = 111139;
    const mPerLon = 111139 * Math.cos((centerLat * Math.PI) / 180);

    const lats: number[] = [];
    const lons: number[] = [];
    const localCoords: Array<{ x: number; y: number }> = [];

    for (let r = 0; r < gridSize; r++) {
      const yYards = halfSpanYards - r * stepYards; // North to South
      const latOffset = (yYards * mPerYard) / mPerLat;
      const ptLat = centerLat + latOffset;

      for (let c = 0; c < gridSize; c++) {
        const xYards = -halfSpanYards + c * stepYards; // West to East
        const lonOffset = (xYards * mPerYard) / mPerLon;
        const ptLon = centerLon + lonOffset;

        lats.push(ptLat);
        lons.push(ptLon);
        localCoords.push({ x: xYards, y: yYards });
      }
    }

    // Fetch batch elevations from Open-Meteo API
    const apiUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats.map(l => l.toFixed(6)).join(',')}&longitude=${lons.map(l => l.toFixed(6)).join(',')}`;
    const apiRes = await fetch(apiUrl);
    if (!apiRes.ok) {
      throw new Error(`Open-Meteo elevation error: HTTP ${apiRes.status}`);
    }
    const data = await apiRes.json();
    const rawElevations: number[] = data.elevation || [];

    const grid = {
      center_lat: centerLat,
      center_lon: centerLon,
      rows: gridSize,
      cols: gridSize,
      spacingYards: stepYards,
      elevations: rawElevations, // meters
      localCoords
    };

    // Cache in Neon if courseId & holeNum provided
    if (courseId && holeNum) {
      try {
        await sql`
          UPDATE course_holes
          SET lidar_grid = ${JSON.stringify(grid)}::jsonb
          WHERE course_id = ${courseId} AND hole_number = ${holeNum};
        `;
      } catch (e) {}
    }

    return res.status(200).json({ grid, cached: false });
  } catch (err: any) {
    console.error('Error in /api/elevation:', err);
    return res.status(500).json({ error: err.message || 'Elevation query failed' });
  }
}
