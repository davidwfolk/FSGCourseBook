async function testBanbury() {
  const lat = 43.67185, lon = -116.36554;
  const query = `[out:json][timeout:25];(way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee"](around:1800,${lat},${lon});way["natural"="water"](around:1800,${lat},${lon}););out geom;`;
  
  const mirrors = [
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ];

  for (const mirror of mirrors) {
    try {
      console.log('Trying mirror:', mirror);
      const res = await fetch(mirror, {
        method: 'POST',
        headers: {
          'User-Agent': 'FSGCourseBook/3.0 (contact@fullstackgolf.com)',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: 'data=' + encodeURIComponent(query)
      });
      if (res.ok) {
        const json = await res.json();
        const holes = json.elements.filter(e => e.tags && e.tags.golf === 'hole');
        const greens = json.elements.filter(e => e.tags && e.tags.golf === 'green');
        const fairways = json.elements.filter(e => e.tags && e.tags.golf === 'fairway');
        const bunkers = json.elements.filter(e => e.tags && (e.tags.golf === 'bunker' || e.tags.natural === 'sand'));
        console.log('Success from', mirror, 'elements:', json.elements.length, {
          holes: holes.length,
          greens: greens.length,
          fairways: fairways.length,
          bunkers: bunkers.length
        });
        return;
      } else {
        console.log('Failed:', res.status, mirror);
      }
    } catch (e) {
      console.log('Error:', e.message, mirror);
    }
  }
}
testBanbury();
