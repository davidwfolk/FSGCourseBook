export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let query: string | null = null;
  if (req.method === 'POST') {
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        query = parsed.query || parsed.data;
      } catch {
        if (req.body.startsWith('data=')) {
          query = decodeURIComponent(req.body.slice(5));
        } else {
          query = req.body;
        }
      }
    } else if (req.body && typeof req.body === 'object') {
      query = req.body.query || req.body.data;
    }
  } else {
    query = new URL(req.url, `http://${req.headers?.host || 'localhost'}`).searchParams.get('data') ||
            new URL(req.url, `http://${req.headers?.host || 'localhost'}`).searchParams.get('query');
  }

  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];

  for (const mirror of mirrors) {
    try {
      const resp = await fetch(mirror, {
        method: 'POST',
        headers: {
          'User-Agent': 'FSGCourseBook/3.0 (contact@fullstackgolf.com)',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: 'data=' + encodeURIComponent(query)
      });
      if (resp.ok) {
        const data = await resp.json();
        return res.status(200).json(data);
      }
    } catch (err) {
      console.warn(`Overpass proxy mirror ${mirror} failed:`, err);
    }
  }

  return res.status(502).json({ error: 'All Overpass mirrors timed out or failed' });
}
