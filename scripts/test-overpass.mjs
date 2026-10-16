async function testOverpass() {
  const lat = 43.6874, lon = -116.3533; // BanBury Golf Course
  const query = `[out:json][timeout:30];(way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee"](around:1800,${lat},${lon});node["natural"="tree"](around:1800,${lat},${lon});way["natural"="water"](around:1800,${lat},${lon}););out geom;`;
  const mirrors = [
    'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query),
    'https://overpass.kumi.systems/api/interpreter?data=' + encodeURIComponent(query),
    'https://lz4.overpass-api.de/api/interpreter?data=' + encodeURIComponent(query)
  ];
  for (const m of mirrors) {
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
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
        console.log('Success from', m.split('/')[2], 'elements:', json.elements?.length);
        const holes = json.elements.filter(e => e.tags && e.tags.golf === 'hole');
        const greens = json.elements.filter(e => e.tags && e.tags.golf === 'green');
        const fairways = json.elements.filter(e => e.tags && e.tags.golf === 'fairway');
        console.log({ holes: holes.length, greens: greens.length, fairways: fairways.length });
        return;
      } else {
        console.log('Failed:', res.status, m.split('/')[2]);
      }
    } catch (e) {
      console.log('Error:', e.message, m.split('/')[2]);
    }
  }
}
testOverpass();
