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
  tees_geojson?: any[];
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
  const teePolygons: Array<{ id: string; coords: number[][]; center: [number, number]; polygon: any }> = [];
  const treeNodes: Array<{ id: string; coords: [number, number] }> = [];

  for (const el of osmData.elements) {
    if (el.type === 'node' && el.tags?.natural === 'tree' && typeof el.lon === 'number' && typeof el.lat === 'number') {
      treeNodes.push({ id: `osm-tree-${el.id}`, coords: [el.lon, el.lat] });
      continue;
    }

    const gType = (el.tags?.golf || '').toLowerCase();
    const nType = (el.tags?.natural || '').toLowerCase();
    const wType = (el.tags?.water || '').toLowerCase();

    // Collect polygon coordinate rings from either ways or relation outer members
    const candidateRings: Array<{ id: string; coords: number[][] }> = [];

    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      const coords = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
      if (gType === 'hole') {
        const refStr = el.tags?.ref || el.tags?.name || '';
        const parVal = parseInt(el.tags?.par, 10) || 4;
        rawHoleWays.push({ id: el.id, ref: refStr, par: parVal, coords });
        continue;
      }
      candidateRings.push({ id: `osm-${gType || nType || 'poly'}-${el.id}`, coords });
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      el.members.forEach((m: any, mIdx: number) => {
        if ((m.role === 'outer' || !m.role) && Array.isArray(m.geometry) && m.geometry.length >= 2) {
          candidateRings.push({
            id: `osm-${gType || nType || 'rel'}-${el.id}-${m.ref || mIdx}`,
            coords: m.geometry.map((pt: any) => [pt.lon, pt.lat])
          });
        }
      });
    }

    for (const item of candidateRings) {
      const rawCoords = item.coords;
      if (rawCoords.length < 3) continue;
      const ring = [...rawCoords];
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push([...ring[0]]);
      }
      if (ring.length >= 4) {
        try {
          const poly = turf.polygon([ring], { id: item.id, tags: el.tags });
          const center = turf.centroid(poly).geometry.coordinates as [number, number];

          if (gType === 'green') {
            greenPolygons.push({ id: item.id, coords: ring, center, polygon: poly, used: false });
          } else if (gType === 'fairway') {
            fairwayPolygons.push({ id: item.id, coords: ring, center, polygon: poly });
          } else if (gType === 'bunker' || nType === 'sand') {
            bunkerPolygons.push({ id: item.id, coords: ring, center, polygon: poly });
          } else if (gType.includes('water') || nType === 'water' || Boolean(wType)) {
            waterPolygons.push({ id: item.id, coords: ring, center, polygon: poly });
          } else if (gType === 'tee') {
            teePolygons.push({ id: item.id, coords: ring, center, polygon: poly });
          }
        } catch {}
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

  const matchedHoles: MatchedHole[] = [];
  const usedGreenIds = new Set<string>();

  // ALWAYS return an array of exactly 18 hole objects (hole_number: 1 through 18)
  for (let hNum = 1; hNum <= 18; hNum++) {
    // 1. Prevent Variable Bleed: strictly initialize all spatial variables at top of every iteration
    let coords: number[][] = [];
    let par = 4;
    let green_polygon: any = null;
    let matchedGreen: typeof greenPolygons[0] | null = null;
    let matchedFairways: any[] = [];
    let holeBunkers: any[] = [];
    let holeTees: any[] = [];
    let holeWater: any[] = [];
    let holeTrees: any[] = [];
    let holeFeatures: any[] = [];
    let tee_lon = 0;
    let tee_lat = 0;
    let green_lon = 0;
    let green_lat = 0;
    let pivot_lon: number | null = null;
    let pivot_lat: number | null = null;

    if (uniqueHolesMap.has(hNum)) {
      const holeWay = uniqueHolesMap.get(hNum)!;
      coords = holeWay.coords;
      par = holeWay.par || 4;

      const teeNode = coords[0];
      const greenPinNode = coords[coords.length - 1];
      const pivotNode = coords.length >= 3 ? coords[coords.length - 2] : coords[0];

      tee_lon = teeNode[0];
      tee_lat = teeNode[1];
      green_lon = greenPinNode[0];
      green_lat = greenPinNode[1];
      pivot_lon = coords.length >= 3 ? pivotNode[0] : null;
      pivot_lat = coords.length >= 3 ? pivotNode[1] : null;

      const pinPt = turf.point([green_lon, green_lat]);
      let minGreenDist = Infinity;

      // 2. Enforce 1-to-1 Green Mapping: skip any green in usedGreenIds
      for (const green of greenPolygons) {
        if (usedGreenIds.has(green.id)) continue;
        const gCenterPt = turf.point(green.center);
        const distM = turf.distance(pinPt, gCenterPt, { units: 'meters' });
        if (distM < minGreenDist && distM <= 95) {
          minGreenDist = distM;
          matchedGreen = green;
        }
      }

      if (matchedGreen) {
        usedGreenIds.add(matchedGreen.id);
        green_polygon = matchedGreen.coords || matchedGreen.polygon?.geometry?.coordinates?.[0] || matchedGreen.polygon;
        green_lon = matchedGreen.center[0];
        green_lat = matchedGreen.center[1];
      }
    } else {
      // Missing hole number: Find next unmatched green polygon from available pool
      const availableGreens = greenPolygons.filter(g => !usedGreenIds.has(g.id));
      if (availableGreens.length > 0) {
        matchedGreen = availableGreens[0];
        usedGreenIds.add(matchedGreen.id);
        green_polygon = matchedGreen.coords || matchedGreen.polygon?.geometry?.coordinates?.[0] || matchedGreen.polygon;
        green_lon = matchedGreen.center[0];
        green_lat = matchedGreen.center[1];

        // Place default tee 350 yards due West/South of green (225° heading)
        const teePt = turf.destination(turf.point([green_lon, green_lat]), 350 * 0.9144, 225, { units: 'meters' });
        tee_lon = teePt.geometry.coordinates[0];
        tee_lat = teePt.geometry.coordinates[1];
        coords = [
          [tee_lon, tee_lat],
          [green_lon, green_lat]
        ];
      } else {
        // Fallback: place hole in radial orbit around course center
        const angleDeg = (hNum * 20) % 360;
        const distM = (220 + (hNum % 6) * 35) * 0.9144;
        const gPt = turf.destination(turf.point([center_lon, center_lat]), distM, angleDeg, { units: 'meters' });
        green_lon = gPt.geometry.coordinates[0];
        green_lat = gPt.geometry.coordinates[1];

        const tPt = turf.destination(gPt, 350 * 0.9144, (angleDeg + 180) % 360, { units: 'meters' });
        tee_lon = tPt.geometry.coordinates[0];
        tee_lat = tPt.geometry.coordinates[1];
        coords = [
          [tee_lon, tee_lat],
          [green_lon, green_lat]
        ];
      }
    }

    const pinPt = turf.point([green_lon, green_lat]);
    const teePt = turf.point([tee_lon, tee_lat]);
    const hole_bearing = normalizeBearing(
      turf.bearing(turf.point([tee_lon, tee_lat]), turf.point([green_lon, green_lat]))
    );

    const approach_bearing = (pivot_lon !== null && pivot_lat !== null)
      ? normalizeBearing(turf.bearing(turf.point([pivot_lon, pivot_lat]), turf.point([green_lon, green_lat])))
      : hole_bearing;

    const clLine = turf.lineString(coords);
    const yardage = Math.round(turf.length(clLine, { units: 'meters' }) * 1.0936133);

    // 3. Fix Fairway & Hazard Buffers: 120m buffer from centerline to capture doglegs and wide fairways
    for (const fw of fairwayPolygons) {
      try {
        let minM = Infinity;
        for (const c of fw.coords) {
          const d = turf.pointToLineDistance(turf.point(c), clLine, { units: 'meters' });
          if (d < minM) minM = d;
        }
        if (minM <= 120 || turf.booleanIntersects(fw.polygon, clLine)) {
          matchedFairways.push(fw.polygon);
        }
      } catch {}
    }

    // Match bunkers within 120m of centerline or 60m of green
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
        if (minM <= 120 || minGreenM <= 60) {
          holeBunkers.push(b.polygon);
        }
      } catch {}
    }

    // Match water hazards within 120m of centerline or 85m of green
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
        if (minM <= 120 || minGreenM <= 85 || turf.booleanIntersects(w.polygon, clLine)) {
          holeWater.push(w.polygon);
        }
      } catch {}
    }

    // Match tee polygons within 55m of tee start point
    for (const t of teePolygons) {
      try {
        const dt = turf.distance(turf.point(t.center), teePt, { units: 'meters' });
        if (dt <= 55) {
          holeTees.push(t.polygon);
        }
      } catch {}
    }

    // Assemble unified features list
    // 1. Tee
    holeFeatures.push({
      id: `tee-${hNum}`,
      type: 'tee',
      coords: [tee_lon, tee_lat],
      props: { label: 'Back Tee', elev: 0 }
    });
    // 1B. Matched Tee Polygons
    holeTees.forEach((tPoly, idx) => {
      const tCoords = tPoly.geometry?.coordinates?.[0] || tPoly.coordinates?.[0] || tPoly.coords || tPoly;
      if (tCoords) {
        holeFeatures.push({
          id: `tee-poly-${hNum}-${idx}`,
          type: 'tee_polygon',
          coords: tCoords,
          props: {}
        });
      }
    });
    // 2. Centerline
    holeFeatures.push({
      id: `cl-${hNum}`,
      type: 'centerline',
      coords,
      props: {}
    });
    // 3. Green
    const gRing = Array.isArray(green_polygon)
      ? (Array.isArray(green_polygon[0]) && Array.isArray(green_polygon[0][0]) ? green_polygon[0] : green_polygon)
      : (green_polygon?.geometry?.coordinates?.[0] || green_polygon?.coordinates?.[0] || null);

    if (gRing && gRing.length >= 3) {
      holeFeatures.push({
        id: `green-${hNum}`,
        type: 'green',
        coords: gRing,
        props: {}
      });
    }
    // 4. Fairways
    matchedFairways.forEach((fwPoly, idx) => {
      const fwCoords = fwPoly.geometry?.coordinates?.[0] || fwPoly.coordinates?.[0] || fwPoly.coords || fwPoly;
      if (fwCoords) {
        holeFeatures.push({
          id: `fw-${hNum}-${idx}`,
          type: 'fairway',
          coords: fwCoords,
          props: {}
        });
      }
    });
    // 5. Bunkers
    holeBunkers.forEach((bkPoly, idx) => {
      const bkCoords = bkPoly.geometry?.coordinates?.[0] || bkPoly.coordinates?.[0] || bkPoly.coords || bkPoly;
      if (bkCoords) {
        holeFeatures.push({
          id: `bunk-${hNum}-${idx}`,
          type: 'bunker',
          coords: bkCoords,
          props: {}
        });
      }
    });
    // 6. Water
    holeWater.forEach((wtPoly, idx) => {
      const wtCoords = wtPoly.geometry?.coordinates?.[0] || wtPoly.coordinates?.[0] || wtPoly.coords || wtPoly;
      if (wtCoords) {
        holeFeatures.push({
          id: `water-${hNum}-${idx}`,
          type: 'water',
          coords: wtCoords,
          props: {}
        });
      }
    });
    // 7. Trees / Wooded nodes within 120m buffer
    for (const tr of treeNodes) {
      try {
        const pt = turf.point(tr.coords);
        const d = turf.pointToLineDistance(pt, clLine, { units: 'meters' });
        const dg = turf.distance(pt, pinPt, { units: 'meters' });
        if (d <= 120 || dg <= 60) {
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
      par,
      yardage: yardage || 350,
      tee_lat,
      tee_lon,
      pivot_lat,
      pivot_lon,
      green_lat,
      green_lon,
      hole_bearing: Math.round(hole_bearing * 10) / 10,
      approach_bearing: Math.round(approach_bearing * 10) / 10,
      centerline: coords,
      green_polygon: gRing || null,
      fairways_geojson: matchedFairways,
      bunkers_geojson: holeBunkers,
      water_geojson: holeWater,
      tees_geojson: holeTees,
      features: holeFeatures
    });
  }

  const unusedGreens = greenPolygons.filter(g => !usedGreenIds.has(g.id)).map(g => g.polygon);

  return {
    courseName: courseNameFallback,
    center_lat,
    center_lon,
    holes: matchedHoles,
    unmatchedGreens: unusedGreens,
    hasExplicitHoles: uniqueHolesMap.size > 0
  };
}

export function buildFallbackHolesFromGreens(
  greenPolygons: Array<{ center: [number, number]; polygon: any }>,
  courseName: string
): MatchedHole[] {
  const dummyOsm = {
    elements: greenPolygons.map((g, i) => ({
      type: 'way',
      id: 990000 + i,
      tags: { golf: 'green' },
      geometry: g.polygon.geometry.coordinates[0].map(([lon, lat]: [number, number]) => ({ lon, lat }))
    }))
  };
  return matchOsmHoles(dummyOsm, courseName).holes;
}
