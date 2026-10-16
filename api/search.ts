import { sql } from './db';

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
  const query = (url.searchParams.get('q') || req.query?.q || '').trim();

  if (!query) {
    return res.status(200).json({ courses: [] });
  }

  const results: any[] = [];
  const seenKeys = new Set<string>();

  // 1. Search saved courses in Neon Postgres
  try {
    const searchPattern = `%${query}%`;
    const neonRows = await sql`
      SELECT c.*, COUNT(ch.id)::int as holes_count
      FROM courses c
      LEFT JOIN course_holes ch ON c.id = ch.course_id
      WHERE c.name ILIKE ${searchPattern} OR c.city ILIKE ${searchPattern}
      GROUP BY c.id
      ORDER BY c.created_at DESC;
    `;
    neonRows.forEach((r: any) => {
      const key = `${r.name.toLowerCase()}-${parseFloat(r.center_lat).toFixed(2)}`;
      seenKeys.add(key);
      results.push({
        id: r.id,
        neonId: r.id,
        name: r.name,
        city: r.city || '',
        state: r.state || '',
        lat: parseFloat(r.center_lat),
        lon: parseFloat(r.center_lon),
        badge: 'Neon DB',
        isNeon: true,
        holesCount: r.holes_count || 18
      });
    });
  } catch (err) {
    console.warn('Neon course search error:', err);
  }

  // 2. Check if query is a 5-digit zip code
  const isZip = /^\d{5}(-\d{4})?$/.test(query);

  if (isZip) {
    const zip = query.slice(0, 5);
    let centerLat: number | null = null;
    let centerLon: number | null = null;
    let zipCity = '';
    let zipState = '';

    try {
      const zpRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (zpRes.ok) {
        const zpData = await zpRes.json();
        if (zpData.places && zpData.places.length > 0) {
          centerLat = parseFloat(zpData.places[0].latitude);
          centerLon = parseFloat(zpData.places[0].longitude);
          zipCity = zpData.places[0]['place name'] || '';
          zipState = zpData.places[0]['state abbreviation'] || '';
        }
      }
    } catch (e) {}

    if (centerLat === null) {
      try {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&postalcode=${encodeURIComponent(zip)}&countrycodes=us&addressdetails=1&limit=1`,
          { headers: { 'User-Agent': 'FSGCourseBook/3.0 (contact@fullstackgolf.com)' } }
        );
        const nomData = await nomRes.json();
        if (nomData && nomData.length > 0) {
          centerLat = parseFloat(nomData[0].lat);
          centerLon = parseFloat(nomData[0].lon);
          zipCity = nomData[0].address?.city || nomData[0].address?.town || nomData[0].address?.county || '';
          zipState = nomData[0].address?.state || '';
        }
      } catch (e) {}
    }

    if (centerLat !== null && centerLon !== null) {
      // Query Overpass for golf courses near zip
      const radiusMeters = 25000;
      const overpassQuery = `[out:json][timeout:25];(way["leisure"="golf_course"](around:${radiusMeters},${centerLat},${centerLon});relation["leisure"="golf_course"](around:${radiusMeters},${centerLat},${centerLon});way["golf"="course"](around:${radiusMeters},${centerLat},${centerLon}););out center tags;`;
      
      const mirrors = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
      ];

      for (const mirror of mirrors) {
        try {
          const opRes = await fetch(mirror, {
            method: 'POST',
            headers: {
              'User-Agent': 'FSGCourseBook/3.0 (contact@fullstackgolf.com)',
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'data=' + encodeURIComponent(overpassQuery)
          });
          if (opRes.ok) {
            const opData = await opRes.json();
            if (opData.elements) {
              opData.elements.forEach((el: any) => {
                const name = el.tags?.name || 'Golf Course (Unnamed in OSM)';
                const lat = el.center?.lat || el.lat;
                const lon = el.center?.lon || el.lon;
                if (!lat || !lon) return;

                const key = `${name.toLowerCase()}-${parseFloat(lat).toFixed(2)}`;
                if (seenKeys.has(key)) return;
                seenKeys.add(key);

                // calculate approx distance in miles
                const dLat = (lat - centerLat!) * 69;
                const dLon = (lon - centerLon!) * 53;
                const distMiles = Math.hypot(dLat, dLon).toFixed(1);

                results.push({
                  name,
                  city: el.tags?.['addr:city'] || zipCity,
                  state: el.tags?.['addr:state'] || zipState,
                  postcode: el.tags?.['addr:postcode'] || zip,
                  lat: parseFloat(lat),
                  lon: parseFloat(lon),
                  badge: `${distMiles} mi from ${zip}`
                });
              });
              break;
            }
          }
        } catch (e) {}
      }
    }
  } else {
    // 3. Search Nominatim by Course Name
    const golfQuery = /golf|country club|links|cc|gc/i.test(query) ? query : `${query} golf`;
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(golfQuery)}&addressdetails=1&extratags=1&limit=12`;
      const nomRes = await fetch(nomUrl, {
        headers: { 'User-Agent': 'FSGCourseBook/3.0 (contact@fullstackgolf.com)' }
      });
      let nomData = await nomRes.json();

      if (!nomData || nomData.length === 0) {
        const rawUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&extratags=1&limit=12`;
        const rawRes = await fetch(rawUrl, {
          headers: { 'User-Agent': 'FSGCourseBook/3.0 (contact@fullstackgolf.com)' }
        });
        nomData = await rawRes.json();
      }

      if (Array.isArray(nomData)) {
        nomData.forEach((item: any) => {
          const addr = item.address || {};
          const name = item.name || addr.golf_course || addr.leisure || item.display_name.split(',')[0];
          const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
          const state = addr.state || addr.region || '';
          const postcode = addr.postcode || '';
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          const isGolf = item.type === 'golf_course' || item.class === 'leisure' || /golf|club|links/i.test(name);

          const key = `${name.toLowerCase()}-${lat.toFixed(2)}`;
          if (seenKeys.has(key)) return;
          seenKeys.add(key);

          results.push({
            name,
            city,
            state,
            postcode,
            lat,
            lon,
            badge: isGolf ? 'Golf Course' : item.type || 'Location'
          });
        });
      }
    } catch (err) {
      console.warn('Nominatim name search error:', err);
    }
  }

  return res.status(200).json({ courses: results });
}
