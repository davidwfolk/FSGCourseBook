import * as turf from '@turf/turf';

async function findFairways() {
  const lat = 43.6259148;
  const lon = -116.4441078;
  const query = `[out:json][timeout:25];(
    way["golf"="fairway"](around:2000,${lat},${lon});
    relation["golf"="fairway"](around:2000,${lat},${lon});
  );out geom;`;

  const resp = await fetch('https://lz4.overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': 'FSGCourseBook/3.0 (contact@fullstackgolf.com)',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'data=' + encodeURIComponent(query)
  });
  const data = await resp.json();
  console.log('Total fairway elements in OSM:', data.elements.length);

  // Hole 2 centerline coords:
  const hole2Coords = [
    [-116.4400763, 43.6268445],
    [-116.4404795, 43.6288095],
    [-116.441992, 43.6292521]
  ];
  const hole2Line = turf.lineString(hole2Coords);

  data.elements.forEach(el => {
    let rawCoords = [];
    if (el.geometry) {
      rawCoords = el.geometry.map(pt => [pt.lon, pt.lat]);
    } else if (el.members) {
      const outer = el.members.find(m => m.role === 'outer' && m.geometry);
      if (outer) rawCoords = outer.geometry.map(pt => [pt.lon, pt.lat]);
    }

    if (rawCoords.length >= 3) {
      const ring = [...rawCoords];
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([...ring[0]]);
      }
      try {
        const poly = turf.polygon([ring]);
        const center = turf.centroid(poly).geometry.coordinates;
        let minD = Infinity;
        for (const pt of ring) {
          const d = turf.pointToLineDistance(turf.point(pt), hole2Line, { units: 'meters' });
          if (d < minD) minD = d;
        }
        const intersects = turf.booleanIntersects(poly, hole2Line);
        console.log(`Fairway ${el.id} (nodes: ${rawCoords.length}, ref: '${el.tags?.ref || ''}'): minD = ${minD.toFixed(1)}m, intersects = ${intersects}, center = [${center[1].toFixed(5)}, ${center[0].toFixed(5)}]`);
      } catch (err) {
        console.log(`Fairway ${el.id} poly error:`, err.message);
      }
    }
  });
}

findFairways();
