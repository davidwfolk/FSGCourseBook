import * as turf from '@turf/turf';

export interface OSMNode {
  id: number;
  lat: number;
  lon: number;
}

export interface OSMWay {
  id: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface MatchedHole {
  hole_number: number;
  par: number;
  handicap?: number;
  yardage: number;
  tee_lat: number;
  tee_lon: number;
  pivot_lat: number | null;
  pivot_lon: number | null;
  green_lat: number;
  green_lon: number;
  hole_bearing: number;
  approach_bearing: number;
  centerline: number[][]; // Array of [lon, lat]
  green_polygon: any | null;
  bunkers_geojson: any[];
  fairways_geojson: any[];
  water_geojson?: any[];
  trees_geojson?: any[];
}

export interface MatchResult {
  courseName: string;
  center_lat: number;
  center_lon: number;
  holes: MatchedHole[];
  unmatchedGreens: any[];
  hasExplicitHoles: boolean;
}

/**
 * Normalizes bearing to 0..360 degrees
 */
export function normalizeBearing(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Returns an Overpass QL query string centered on lat, lon
 */
export function getOverpassQuery(lat: number, lon: number, radiusMeters: number = 2200): string {
  return `[out:json][timeout:35];
(
  way["golf"~"hole|green|fairway|bunker|tee|water_hazard|lateral_water_hazard"](around:${radiusMeters},${lat},${lon});
  node["natural"="tree"](around:${radiusMeters},${lat},${lon});
  way["natural"="water"](around:${radiusMeters},${lat},${lon});
);
out geom;`;
}

/**
 * Parses raw Overpass JSON elements and executes the Hole 1-18 spatial join.
 */
export function matchOsmHoles(osmData: { elements: any[] }, courseNameFallback: string = "Custom Golf Course"): MatchResult {
  const elements = osmData.elements || [];

  const rawHoleWays: Array<{ id: string; ref: string; par: number; coords: number[][] }> = [];
  const greenPolygons: Array<{ id: string; coords: number[][]; center: [number, number]; polygon: any; used?: boolean }> = [];
  const fairwayPolygons: Array<{ id: string; coords: number[][]; polygon: any; center: [number, number] }> = [];
  const bunkerPolygons: Array<{ id: string; coords: number[][]; polygon: any; center: [number, number] }> = [];
  const waterPolygons: Array<{ id: string; coords: number[][]; polygon: any; center: [number, number] }> = [];
  const treeNodes: Array<{ id: string; coords: [number, number] }> = [];

  // 1. Parse elements
  for (const el of elements) {
    if (el.type === 'way' && el.geometry && el.geometry.length > 0) {
      const coords: number[][] = el.geometry.map((pt: { lat: number; lon: number }) => [pt.lon, pt.lat]);
      const gType = el.tags?.golf || '';
      const nType = el.tags?.natural || '';

      if (gType === 'hole') {
        const refStr = el.tags?.ref || el.tags?.name || '';
        const parVal = parseInt(el.tags?.par || el.tags?.['golf:par'] || '4', 10) || 4;
        rawHoleWays.push({
          id: `osm-hole-${el.id}`,
          ref: refStr,
          par: parVal,
          coords
        });
        continue;
      }

      if (coords.length >= 3) {
        // Ensure polygon ring is closed
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
            } else if (gType.includes('water') || nType === 'water') {
              waterPolygons.push({ id: `osm-water-${el.id}`, coords: ring, center, polygon: poly });
            }
          } catch (e) {
            // invalid polygon skipped
          }
        }
      }
    } else if (el.type === 'node' && el.tags?.natural === 'tree') {
      treeNodes.push({
        id: `osm-tree-${el.id}`,
        coords: [el.lon, el.lat]
      });
    }
  }

  // Calculate center of course
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

  // 2. Sort all way["golf"="hole"] features numerically by parseInt(tags.ref)
  const sortedHoleWays = rawHoleWays
    .map(h => {
      const parsedNum = parseInt(h.ref.replace(/\D/g, ''), 10);
      return { ...h, holeNum: isNaN(parsedNum) ? null : parsedNum };
    })
    .filter(h => h.holeNum !== null && h.holeNum >= 1 && h.holeNum <= 18)
    .sort((a, b) => (a.holeNum as number) - (b.holeNum as number));

  const matchedHoles: MatchedHole[] = [];

  // Deduplicate by holeNum if multiple ways exist with the same ref (keep the longest)
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
      const teeNode = coords[0]; // [lon, lat]
      const greenPinNode = coords[coords.length - 1]; // [lon, lat]
      const pivotNode = coords.length >= 3 ? coords[coords.length - 2] : coords[0];

      const tee_lon = teeNode[0];
      const tee_lat = teeNode[1];
      let green_lon = greenPinNode[0];
      let green_lat = greenPinNode[1];
      const pivot_lon = coords.length >= 3 ? pivotNode[0] : null;
      const pivot_lat = coords.length >= 3 ? pivotNode[1] : null;

      // Spatially match green_pin_coord to nearest golf=green polygon centroid within 40m (or up to 60m)
      const pinPt = turf.point([green_lon, green_lat]);
      let bestGreen: typeof greenPolygons[0] | null = null;
      let minGreenDist = Infinity;

      for (const green of greenPolygons) {
        if (green.used) continue;
        const gCenterPt = turf.point(green.center);
        const distM = turf.distance(pinPt, gCenterPt, { units: 'meters' });
        if (distM < minGreenDist && distM <= 60) { // Check within 40-60m
          minGreenDist = distM;
          bestGreen = green;
        }
      }

      let green_polygon: any = null;
      if (bestGreen) {
        bestGreen.used = true;
        green_polygon = bestGreen.polygon;
        // Optionally snap green pin to green centroid if pin is outside
        green_lon = bestGreen.center[0];
        green_lat = bestGreen.center[1];
      }

      // Calculate hole_bearing (tee -> green) and approach_bearing (pivot -> green)
      const hole_bearing = normalizeBearing(
        turf.bearing(turf.point([tee_lon, tee_lat]), turf.point([green_lon, green_lat]))
      );

      const approach_bearing = (pivot_lon !== null && pivot_lat !== null)
        ? normalizeBearing(turf.bearing(turf.point([pivot_lon, pivot_lat]), turf.point([green_lon, green_lat])))
        : hole_bearing;

      // Yardage along centerline
      const clLine = turf.lineString(coords);
      const yardage = Math.round(turf.length(clLine, { units: 'meters' }) * 1.0936133);

      // Spatially match golf=fairway and golf=bunker polygons within 45 meters of the hole centerline
      const holeFairways: any[] = [];
      for (const fw of fairwayPolygons) {
        try {
          const distToLineM = turf.pointToLineDistance(turf.point(fw.center), clLine, { units: 'meters' });
          if (distToLineM <= 45) {
            holeFairways.push(fw.polygon);
          }
        } catch (e) {
          // fallback
        }
      }

      const holeBunkers: any[] = [];
      for (const b of bunkerPolygons) {
        try {
          const distToLineM = turf.pointToLineDistance(turf.point(b.center), clLine, { units: 'meters' });
          if (distToLineM <= 50) {
            holeBunkers.push(b.polygon);
          }
        } catch (e) {
          // fallback
        }
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
        bunkers_geojson: holeBunkers
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

/**
 * Fallback generator for courses with only green polygons or manual points.
 */
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

    // Estimate tee 360 yards due south (bearing 180) as placeholder
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
