import * as turf from '@turf/turf';

export interface MatchedHole {
  hole_number: number;
  par: number;
  yardage: number;
  tee_lat: number;
  tee_lon: number;
  pivot_lat: number | null;
  pivot_lon: number | null;
  green_lat: number;
  green_lon: number;
  hole_bearing: number;
  approach_bearing: number;
  centerline: number[][]; // [[lon, lat], ...]
  green_polygon: any;
  fairways_geojson: any[];
  bunkers_geojson: any[];
  water_geojson?: any[];
  features?: any[];
}

function normalizeBearing(deg: number): number {
  return (deg + 360) % 360;
}

export function matchOsmHoles(osmData: any, courseNameFallback: string) {
  if (!osmData || !Array.isArray(osmData.elements)) {
    return { courseName: courseNameFallback, center_lat: 0, center_lon: 0, holes: [], unmatchedGreens: [], hasExplicitHoles: false };
  }

  const rawHoleWays: Array<{ id: number; ref: string; par: number; coords: number[][] }> = [];
  const greenPolygons: Array<{ id: string; coords: number[][]; center: [number, number]; polygon: any; used?: boolean }> = [];
  const fairwayPolygons: Array<{ id: string; coords: number[][]; center: [number, number]; polygon: any }> = [];
  const bunkerPolygons: Array<{ id: string; coords: number[][]; center: [number, number]; polygon: any }> = [];
  const waterPolygons: Array<{ id: string; coords: number[][]; center: [number, number]; polygon: any }> = [];
  const treeNodes: Array<{ id: string; coords: [number, number] }> = [];

  for (const el of osmData.elements) {
    if (el.type === 'node' && el.tags?.natural === 'tree' && typeof el.lon === 'number' && typeof el.lat === 'number') {
      treeNodes.push({ id: `osm-tree-${el.id}`, coords: [el.lon, el.lat] });
      continue;
    }

    if ((el.type === 'way' || el.type === 'relation') && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      const gType = (el.tags?.golf || '').toLowerCase();
      const nType = (el.tags?.natural || '').toLowerCase();
      const wType = (el.tags?.water || '').toLowerCase();
      const coords = el.geometry.map((pt: any) => [pt.lon, pt.lat]);

      if (gType === 'hole') {
        const refStr = el.tags?.ref || el.tags?.name || '';
        const parVal = parseInt(el.tags?.par, 10) || 4;
        rawHoleWays.push({ id: el.id, ref: refStr, par: parVal, coords });
      } else {
        const ring = [...coords];
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
          ring.push([...ring[0]]);
        }
        if (ring.length >= 4) {
          try {
            const poly = turf.polygon([ring], { id: el.id, tags: el.tags });
            const center = turf.centroid(poly).geometry.coordinates as [number, number];

            if (gType === 'green') {
              greenPolygons.push({ id: `osm-green-${el.id}`, coords: ring, center, polygon: poly });
            } else if (gType === 'fairway') {
              fairwayPolygons.push({ id: `osm-fairway-${el.id}`, coords: ring, center, polygon: poly });
            } else if (gType === 'bunker' || nType === 'sand') {
              bunkerPolygons.push({ id: `osm-bunker-${el.id}`, coords: ring, center, polygon: poly });
            } else if (gType.includes('water') || nType === 'water' || Boolean(wType)) {
              waterPolygons.push({ id: `osm-water-${el.id}`, coords: ring, center, polygon: poly });
            }
          } catch {}
        }
      }
    }
  }

  let center_lat = 0;
  let center_lon = 0;
  let count = 0;
  if (greenPolygons.length > 0) {
    for (const g of greenPolygons) {
      center_lon += g.center[0];
      center_lat += g.center[1];
      count++;
    }
  } else if (rawHoleWays.length > 0) {
    for (const h of rawHoleWays) {
      center_lon += h.coords[0][0];
      center_lat += h.coords[0][1];
      count++;
    }
  }
  if (count > 0) {
    center_lat /= count;
    center_lon /= count;
  }

  const sortedHoleWays = rawHoleWays
    .map(h => {
      const parsedNum = parseInt(h.ref.replace(/\D/g, ''), 10);
      return { ...h, holeNum: isNaN(parsedNum) ? null : parsedNum };
    })
    .filter(h => h.holeNum !== null && h.holeNum >= 1 && h.holeNum <= 18)
    .sort((a, b) => (a.holeNum as number) - (b.holeNum as number));

  const matchedHoles: MatchedHole[] = [];
  const uniqueHolesMap = new Map<number, typeof sortedHoleWays[0]>();
  for (const h of sortedHoleWays) {
    const num = h.holeNum as number;
    if (!uniqueHolesMap.has(num)) {
      uniqueHolesMap.set(num, h);
    } else {
      const existing = uniqueHolesMap.get(num)!;
      if (h.coords.length > existing.coords.length) {
        uniqueHolesMap.set(num, h);
      }
    }
  }

  if (uniqueHolesMap.size > 0) {
    const holeNums = Array.from(uniqueHolesMap.keys()).sort((a, b) => a - b);

    for (const hNum of holeNums) {
      const holeWay = uniqueHolesMap.get(hNum)!;
      const coords = holeWay.coords;
      const teeNode = coords[0];
      const greenPinNode = coords[coords.length - 1];
      const pivotNode = coords.length >= 3 ? coords[coords.length - 2] : coords[0];

      const tee_lon = teeNode[0];
      const tee_lat = teeNode[1];
      let green_lon = greenPinNode[0];
      let green_lat = greenPinNode[1];
      const pivot_lon = coords.length >= 3 ? pivotNode[0] : null;
      const pivot_lat = coords.length >= 3 ? pivotNode[1] : null;

      const pinPt = turf.point([green_lon, green_lat]);
      let bestGreen: typeof greenPolygons[0] | null = null;
      let minGreenDist = Infinity;

      for (const green of greenPolygons) {
        if (green.used) continue;
        const gCenterPt = turf.point(green.center);
        const distM = turf.distance(pinPt, gCenterPt, { units: 'meters' });
        if (distM < minGreenDist && distM <= 65) {
          minGreenDist = distM;
          bestGreen = green;
        }
      }

      let green_polygon: any = null;
      if (bestGreen) {
        bestGreen.used = true;
        green_polygon = bestGreen.polygon;
        green_lon = bestGreen.center[0];
        green_lat = bestGreen.center[1];
      }

      const hole_bearing = normalizeBearing(
        turf.bearing(turf.point([tee_lon, tee_lat]), turf.point([green_lon, green_lat]))
      );

      const approach_bearing = (pivot_lon !== null && pivot_lat !== null)
        ? normalizeBearing(turf.bearing(turf.point([pivot_lon, pivot_lat]), turf.point([green_lon, green_lat])))
        : hole_bearing;

      const clLine = turf.lineString(coords);
      const yardage = Math.round(turf.length(clLine, { units: 'meters' }) * 1.0936133);

      const holeFairways: any[] = [];
      for (const fw of fairwayPolygons) {
        try {
          let minM = Infinity;
          for (const c of fw.coords) {
            const d = turf.pointToLineDistance(turf.point(c), clLine, { units: 'meters' });
            if (d < minM) minM = d;
          }
          if (minM <= 35 || turf.booleanIntersects(fw.polygon, clLine)) {
            holeFairways.push(fw.polygon);
          }
        } catch {}
      }

      const holeBunkers: any[] = [];
      for (const b of bunkerPolygons) {
        try {
          let minM = Infinity;
          let minGreenM = Infinity;
          for (const c of b.coords) {
            const d = turf.pointToLineDistance(turf.point(c), clLine, { units: 'meters' });
            if (d < minM) minM = d;
            const dg = turf.distance(turf.point(c), pinPt, { units: 'meters' });
            if (dg < minGreenM) minGreenM = dg;
          }
          if (minM <= 50 || minGreenM <= 45) {
            holeBunkers.push(b.polygon);
          }
        } catch {}
      }

      const holeWater: any[] = [];
      for (const w of waterPolygons) {
        try {
          let minM = Infinity;
          let minGreenM = Infinity;
          for (const c of w.coords) {
            const d = turf.pointToLineDistance(turf.point(c), clLine, { units: 'meters' });
            if (d < minM) minM = d;
            const dg = turf.distance(turf.point(c), pinPt, { units: 'meters' });
            if (dg < minGreenM) minGreenM = dg;
          }
          if (minM <= 65 || minGreenM <= 55) {
            holeWater.push(w.polygon);
          }
        } catch {}
      }

      const holeFeatures: any[] = [];
      // 1. Tee
      holeFeatures.push({
        id: `tee-${hNum}`,
        type: 'tee',
        coords: [tee_lon, tee_lat],
        props: { label: 'Back Tee', elev: 0 }
      });
      // 2. Centerline
      holeFeatures.push({
        id: `cl-${hNum}`,
        type: 'centerline',
        coords,
        props: {}
      });
      // 3. Green
      if (green_polygon) {
        holeFeatures.push({
          id: `green-${hNum}`,
          type: 'green',
          coords: bestGreen ? bestGreen.coords : green_polygon.coordinates[0],
          props: {}
        });
      }
      // 4. Fairways
      holeFairways.forEach((fwPoly, idx) => {
        holeFeatures.push({
          id: `fw-${hNum}-${idx}`,
          type: 'fairway',
          coords: fwPoly.geometry?.coordinates?.[0] || fwPoly.coordinates?.[0],
          props: {}
        });
      });
      // 5. Bunkers
      holeBunkers.forEach((bkPoly, idx) => {
        holeFeatures.push({
          id: `bunk-${hNum}-${idx}`,
          type: 'bunker',
          coords: bkPoly.geometry?.coordinates?.[0] || bkPoly.coordinates?.[0],
          props: {}
        });
      });
      // 6. Water
      holeWater.forEach((wtPoly, idx) => {
        holeFeatures.push({
          id: `water-${hNum}-${idx}`,
          type: 'water',
          coords: wtPoly.geometry?.coordinates?.[0] || wtPoly.coordinates?.[0],
          props: {}
        });
      });
      // 7. Trees
      for (const tr of treeNodes) {
        try {
          const pt = turf.point(tr.coords);
          const d = turf.pointToLineDistance(pt, clLine, { units: 'meters' });
          const dg = turf.distance(pt, pinPt, { units: 'meters' });
          if (d <= 38 || dg <= 32) {
            holeFeatures.push({
              id: tr.id,
              type: 'tree',
              coords: tr.coords,
              props: { label: '', elev: 0, radius: 8, dx: 0, dy: 0 }
            });
          }
        } catch {}
      }

      matchedHoles.push({
        hole_number: hNum,
        par: holeWay.par,
        yardage,
        tee_lat,
        tee_lon,
        pivot_lat,
        pivot_lon,
        green_lat,
        green_lon,
        hole_bearing: Math.round(hole_bearing * 10) / 10,
        approach_bearing: Math.round(approach_bearing * 10) / 10,
        centerline: coords,
        green_polygon,
        fairways_geojson: holeFairways,
        bunkers_geojson: holeBunkers,
        water_geojson: holeWater,
        features: holeFeatures
      });
    }
  }

  const unusedGreens = greenPolygons.filter(g => !g.used).map(g => g.polygon);

  return {
    courseName: courseNameFallback,
    center_lat,
    center_lon,
    holes: matchedHoles,
    unmatchedGreens: unusedGreens,
    hasExplicitHoles: matchedHoles.length > 0
  };
}

export function buildFallbackHolesFromGreens(
  greenPolygons: Array<{ center: [number, number]; polygon: any }>,
  courseName: string
): MatchedHole[] {
  const holes: MatchedHole[] = [];
  const count = Math.min(18, greenPolygons.length);

  for (let i = 0; i < count; i++) {
    const hNum = i + 1;
    const g = greenPolygons[i];
    const green_lon = g.center[0];
    const green_lat = g.center[1];

    const teePt = turf.destination(turf.point([green_lon, green_lat]), 360 * 0.9144, 180, { units: 'meters' });
    const tee_lon = teePt.geometry.coordinates[0];
    const tee_lat = teePt.geometry.coordinates[1];

    const centerline = [
      [tee_lon, tee_lat],
      [green_lon, green_lat]
    ];

    const hole_bearing = normalizeBearing(
      turf.bearing(turf.point([tee_lon, tee_lat]), turf.point([green_lon, green_lat]))
    );

    holes.push({
      hole_number: hNum,
      par: 4,
      yardage: 360,
      tee_lat,
      tee_lon,
      pivot_lat: null,
      pivot_lon: null,
      green_lat,
      green_lon,
      hole_bearing: Math.round(hole_bearing * 10) / 10,
      approach_bearing: Math.round(hole_bearing * 10) / 10,
      centerline,
      green_polygon: g.polygon,
      fairways_geojson: [],
      bunkers_geojson: []
    });
  }

  return holes;
}
