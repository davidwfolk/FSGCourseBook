import * as turf from '@turf/turf';
import { apiClient, CourseRecord, HoleRecord } from './api-client';
import { matchOsmHoles, buildFallbackHolesFromGreens, getOverpassQuery, normalizeBearing } from './osm-hole-matcher';
import { HoleData, HoleFeature, CourseHolesStore } from './types';

declare const L: any;
declare const lucide: any;

/********************************************************************
 * 1. CONSTANTS, GEOMETRY HELPERS & CHAMPIONSHIP PRESETS
 ********************************************************************/
const YARD_TO_M = 0.9144;
const M_TO_YARD = 1.0936133;
const STORAGE_KEY = "tourbook_gis_v3_project_state";

export function localYardsToLngLat(originLngLat: [number, number], xYards: number, yYards: number, bearingDeg: number = 0): [number, number] {
  const distYards = Math.hypot(xYards, yYards);
  if (distYards < 0.001) return [...originLngLat];
  const angleDeg = (Math.atan2(xYards, yYards) * 180) / Math.PI + bearingDeg;
  const pt = turf.destination(turf.point(originLngLat), distYards * YARD_TO_M, angleDeg, { units: 'meters' });
  return pt.geometry.coordinates as [number, number];
}

export function smoothPolygonCoords(ringCoords: number[][], refinements: number = 2): number[][] {
  if (!ringCoords || ringCoords.length < 4) return ringCoords;
  let pts = ringCoords.slice(0, -1);
  for (let r = 0; r < refinements; r++) {
    const nextPts: number[][] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      nextPts.push([p1[0] * 0.75 + p2[0] * 0.25, p1[1] * 0.75 + p2[1] * 0.25]);
      nextPts.push([p1[0] * 0.25 + p2[0] * 0.75, p1[1] * 0.25 + p2[1] * 0.75]);
    }
    pts = nextPts;
  }
  pts.push([...pts[0]]);
  return pts;
}

export function buildPreset1Hole(): HoleData {
  const teeOrigin: [number, number] = [-121.94855, 36.56885];
  const bearing = 332;
  const pt = (x: number, y: number) => localYardsToLngLat(teeOrigin, x, y, bearing);
  const poly = (pts: number[][]) => {
    const ring = pts.map(([x, y]) => pt(x, y));
    ring.push(ring[0]);
    return ring;
  };

  return {
    meta: {
      holeNumber: 1,
      par: 4,
      greenSlopeDir: 215,
      greenSlopePct: 3.1,
      courseName: "Championship Links"
    },
    lidarGrid: null,
    features: [
      { id: "tee-1", type: "tee", coords: pt(0, 0), props: { label: "Back Tee", elev: 1 } },
      { id: "centerline-1", type: "centerline", coords: [pt(0, 0), pt(-2, 275), pt(-6, 420), pt(-6, 437)], props: {} },
      {
        id: "fairway-1",
        type: "fairway",
        coords: poly([
          [-14, 195], [-19, 212], [-18, 232], [-14, 248], [-11, 268],
          [-7, 286], [-13, 305], [-16, 322], [-21, 336], [-17, 355],
          [-19, 374], [-17, 392], [-11, 405], [-13, 416],
          [1, 416], [3, 403], [0, 390], [6, 374], [6, 352],
          [9, 334], [14, 314], [17, 294], [19, 272], [18, 250],
          [14, 228], [7, 210], [-2, 196]
        ]),
        props: {}
      },
      {
        id: "green-1",
        type: "green",
        coords: poly([
          [-6, 420], [-14, 423], [-20, 431], [-21, 441], [-16, 449],
          [-6, 453], [6, 452], [11, 445], [9, 434], [2, 424]
        ]),
        props: {}
      },
      {
        id: "ridge-fw-1",
        type: "ridge",
        coords: [pt(-11, 322), pt(-3, 330), pt(6, 327), pt(12, 318)],
        props: { label: "" }
      },
      {
        id: "ridge-fw-2",
        type: "ridge",
        coords: [pt(-14, 372), pt(-6, 382), pt(2, 376)],
        props: { label: "" }
      },
      {
        id: "bunker-fw-l1",
        type: "bunker",
        coords: poly([[-19, 243], [-25, 246], [-26, 254], [-22, 260], [-16, 257], [-16, 248]]),
        props: { label: "" }
      },
      {
        id: "bunker-fw-l2",
        type: "bunker",
        coords: poly([[-20, 264], [-25, 267], [-25, 276], [-19, 279], [-16, 273], [-17, 266]]),
        props: { label: "" }
      },
      {
        id: "bunker-fw-l3",
        type: "bunker",
        coords: poly([[-16, 282], [-21, 286], [-20, 296], [-14, 299], [-10, 293], [-11, 285]]),
        props: { label: "" }
      },
      {
        id: "bunker-gs-r1",
        type: "bunker",
        coords: poly([[1, 405], [-1, 412], [2, 418], [9, 419], [12, 411], [8, 404]]),
        props: { label: "" }
      },
      {
        id: "bunker-gs-r2",
        type: "bunker",
        coords: poly([[13, 414], [11, 424], [13, 434], [20, 436], [23, 425], [19, 415]]),
        props: { label: "" }
      },
      {
        id: "bunker-gs-l1",
        type: "bunker",
        coords: poly([[-24, 411], [-28, 419], [-27, 431], [-22, 433], [-19, 423], [-20, 413]]),
        props: { label: "" }
      },
      {
        id: "water-l1",
        type: "water",
        coords: poly([[-36, 220], [-40, 222], [-38, 285], [-41, 345], [-38, 390], [-34, 390], [-37, 345], [-34, 285]]),
        props: { label: "Creek" }
      },
      { id: "target-1", type: "target", coords: pt(1, 242), props: { subtype: "sprinkler", elev: 0, label: "" } },
      { id: "target-2", type: "target", coords: pt(2, 267), props: { subtype: "cross_gold", elev: 0, label: "" } },
      { id: "target-3", type: "target", coords: pt(4, 293), props: { subtype: "sprinkler", elev: 0, label: "" } },
      { id: "target-4", type: "target", coords: pt(3, 315), props: { subtype: "cross_gold", elev: 0, label: "" } },
      { id: "target-5", type: "target", coords: pt(-1, 335), props: { subtype: "cross_red", elev: 0, label: "" } },
      { id: "target-6", type: "target", coords: pt(-5, 356), props: { subtype: "sprinkler", elev: 0, label: "" } },
      { id: "target-7", type: "target", coords: pt(-7, 381), props: { subtype: "sprinkler", elev: 1, label: "" } },
      { id: "target-edge-r1", type: "target", coords: pt(18, 286), props: { subtype: "edge_ring", elev: 0, label: "A" } },
      { id: "target-edge-r2", type: "target", coords: pt(16, 314), props: { subtype: "edge_ring", elev: 0, label: "" } },
      { id: "target-edge-r3", type: "target", coords: pt(10, 339), props: { subtype: "edge_ring", elev: 0, label: "" } },
      { id: "target-edge-r4", type: "target", coords: pt(7, 356), props: { subtype: "edge_ring", elev: 0, label: "" } },
      { id: "target-edge-l1", type: "target", coords: pt(-9, 300), props: { subtype: "edge_ring", elev: 0, label: "" } },
      { id: "target-edge-l2", type: "target", coords: pt(-13, 313), props: { subtype: "edge_ring", elev: 0, label: "" } },
      { id: "tree-1", type: "tree", coords: pt(-24, 315), props: { label: "", elev: 0, radius: 7 } },
      { id: "tree-2", type: "tree", coords: pt(-25, 344), props: { label: "", elev: 0, radius: 8 } },
      { id: "tree-3", type: "tree", coords: pt(24, 275), props: { label: "", elev: 0, radius: 8 } },
      { id: "tree-4", type: "tree", coords: pt(21, 325), props: { label: "", elev: 0, radius: 7 } }
    ]
  };
}

export function buildPreset2Hole(): HoleData {
  const teeOrigin: [number, number] = [-121.9512, 36.5715];
  const bearing = 38;
  const pt = (x: number, y: number) => localYardsToLngLat(teeOrigin, x, y, bearing);
  const poly = (pts: number[][]) => {
    const ring = pts.map(([x, y]) => pt(x, y));
    ring.push(ring[0]);
    return ring;
  };

  return {
    meta: {
      holeNumber: 1,
      par: 4,
      greenSlopeDir: 205,
      greenSlopePct: 3.4,
      courseName: "Parkland Championship"
    },
    lidarGrid: null,
    features: [
      { id: "p2-tee", type: "tee", coords: pt(0, 0), props: { label: "Championship Tee", elev: 2 } },
      { id: "p2-centerline", type: "centerline", coords: [pt(0, 0), pt(3, 250), pt(0, 366), pt(0, 383)], props: {} },
      {
        id: "p2-fairway",
        type: "fairway",
        coords: poly([
          [-8, 175], [-12, 205], [-9, 235], [-7, 265], [-14, 285],
          [-19, 305], [-16, 325], [-10, 338], [-6, 352], [-6, 364],
          [4, 364], [4, 348], [2, 330], [5, 310], [12, 295],
          [19, 275], [20, 245], [16, 210], [9, 180], [0, 170]
        ]),
        props: {}
      },
      {
        id: "p2-green",
        type: "green",
        coords: poly([
          [0, 366], [-8, 369], [-10, 378], [-8, 387], [-11, 395],
          [-6, 400], [5, 399], [12, 391], [11, 380], [7, 370]
        ]),
        props: {}
      },
      {
        id: "p2-bunk-r",
        type: "bunker",
        coords: poly([[6, 346], [5, 353], [12, 355], [15, 364], [21, 363], [22, 345], [14, 348]]),
        props: { label: "" }
      },
      {
        id: "p2-bunk-l1",
        type: "bunker",
        coords: poly([[-19, 358], [-25, 362], [-22, 369], [-15, 365]]),
        props: { label: "" }
      },
      {
        id: "p2-bunk-l2",
        type: "bunker",
        coords: poly([[-15, 374], [-21, 377], [-20, 388], [-13, 386], [-11, 378]]),
        props: { label: "" }
      },
      { id: "p2-t1", type: "target", coords: pt(0, 228), props: { subtype: "sprinkler", elev: 0, label: "" } },
      { id: "p2-t2", type: "target", coords: pt(7, 250), props: { subtype: "sprinkler", elev: 7, label: "" } },
      { id: "p2-t3", type: "target", coords: pt(5, 275), props: { subtype: "sprinkler", elev: 6, label: "" } },
      { id: "p2-t4", type: "target", coords: pt(-5, 300), props: { subtype: "cross_gold", elev: 5, label: "" } },
      { id: "p2-t5", type: "target", coords: pt(-6, 325), props: { subtype: "cross_red", elev: 4, label: "" } },
      { id: "p2-edge-1", type: "target", coords: pt(6, 299), props: { subtype: "edge_ring", elev: 0, label: "A" } },
      { id: "p2-edge-2", type: "target", coords: pt(-9, 339), props: { subtype: "edge_ring", elev: 0, label: "B" } },
      { id: "p2-tree-bigoak", type: "tree", coords: pt(-24, 291), props: { label: '"Big Oak"', elev: 0, radius: 10 } },
      { id: "p2-tree-l1", type: "tree", coords: pt(-17, 253), props: { label: "", elev: 0, radius: 8 } },
      { id: "p2-tree-l2", type: "tree", coords: pt(-21, 261), props: { label: "", elev: 0, radius: 8 } },
      { id: "p2-tree-l3", type: "tree", coords: pt(-16, 349), props: { label: "", elev: 0, radius: 8 } },
      { id: "p2-tree-r1", type: "tree", coords: pt(19, 227), props: { label: "", elev: 0, radius: 8 } },
      { id: "p2-tree-r2", type: "tree", coords: pt(26, 262), props: { label: "", elev: 0, radius: 9 } },
      { id: "p2-tree-r3", type: "tree", coords: pt(16, 305), props: { label: "", elev: 0, radius: 8 } }
    ]
  };
}

/********************************************************************
 * 2. APPLICATION STATE & NEON PERSISTENCE
 ********************************************************************/
export let holeData: HoleData = buildPreset1Hole();
export let courseHolesStore: CourseHolesStore = {};
export let cachedCourseOSM: any = null;
export let activeCourseId: string | null = null;
export let activeCourseRecord: CourseRecord | null = null;

let activeTool = "select";
let selectedFeatureId: string | null = null;
let drawingPoints: number[][] = [];
let tempDrawingLayer: any = null;

let viewMode = "full"; // 'full' | 'split' | 'green' | 'usga'
let showCorridorCutout = true;
let showLadders = true;
let showHachures = true;

// Fallback mode state (Click Tee -> Green 1..18)
let fallbackModeActive = false;
let fallbackTeeMarkerCoord: [number, number] | null = null;

export const map = L.map("map", {
  center: [36.5705, -121.9495],
  zoom: 17,
  zoomControl: false,
  attributionControl: true
});

L.control.zoom({ position: "bottomright" }).addTo(map);

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 20,
  attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, USDA, USGS"
}).addTo(map);

const featureLayerGroup = L.layerGroup().addTo(map);
const handleLayerGroup = L.layerGroup().addTo(map);

export function showToast(msg: string) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  const textEl = document.getElementById("toast-text");
  if (textEl) textEl.textContent = msg;
  toast.classList.remove("opacity-0");
  toast.classList.add("opacity-100");
  clearTimeout((window as any).__toastTimer);
  (window as any).__toastTimer = setTimeout(() => {
    toast.classList.remove("opacity-100");
    toast.classList.add("opacity-0");
  }, 3000);
}

export function setStatus(msg: string) {
  const statusEl = document.getElementById("status-message");
  if (statusEl) {
    statusEl.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
      <span>${msg}</span>
    `;
  }
}

let saveDebounceTimer: any = null;

/**
 * Saves current hole state to Neon Postgres and localStorage
 */
export function persistCurrentHoleState() {
  const curHoleNum = parseInt((document.getElementById("meta-hole-num") as HTMLInputElement)?.value, 10) || 1;
  const courseName = (document.getElementById("meta-course-name") as HTMLInputElement)?.value || "Lakeview";

  holeData.meta = {
    holeNumber: curHoleNum,
    par: parseInt((document.getElementById("meta-hole-par") as HTMLInputElement)?.value, 10) || 4,
    greenSlopeDir: parseFloat((document.getElementById("meta-green-slope-dir") as HTMLInputElement)?.value) || 215,
    greenSlopePct: parseFloat((document.getElementById("meta-green-slope-pct") as HTMLInputElement)?.value) || 2.8,
    courseName
  };

  courseHolesStore[curHoleNum] = JSON.parse(JSON.stringify(holeData));

  // Local storage backup
  try {
    const payload = {
      version: 3,
      activeHoleNum: curHoleNum,
      activeCourseId,
      courseName: holeData.meta.courseName,
      mapCenter: [map.getCenter().lat, map.getCenter().lng],
      mapZoom: map.getZoom(),
      greenZoom: parseFloat((document.getElementById("meta-green-zoom") as HTMLInputElement)?.value) || 2.3,
      corridorYds: parseFloat((document.getElementById("meta-corridor-yds") as HTMLInputElement)?.value) || 20,
      courseHolesStore,
      cachedCourseOSM
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    // quota exceeded or private mode
  }

  // Neon Postgres persistence with debounce
  if (activeCourseId) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(async () => {
      try {
        const teeFeat = holeData.features.find(f => f.type === 'tee');
        const greenFeat = holeData.features.find(f => f.type === 'green');
        const clFeat = holeData.features.find(f => f.type === 'centerline');
        const model = (window as any).__lastSpatialModel;

        const teeLat = teeFeat ? teeFeat.coords[1] : (clFeat ? clFeat.coords[0][1] : 0);
        const teeLon = teeFeat ? teeFeat.coords[0] : (clFeat ? clFeat.coords[0][0] : 0);
        const greenLat = greenFeat ? turf.centroid(turf.polygon([greenFeat.coords])).geometry.coordinates[1] : 0;
        const greenLon = greenFeat ? turf.centroid(turf.polygon([greenFeat.coords])).geometry.coordinates[0] : 0;

        await apiClient.saveHole({
          course_id: activeCourseId!,
          hole_number: curHoleNum,
          par: holeData.meta.par,
          yardage: model?.totalHoleYards || 400,
          tee_lat: teeLat,
          tee_lon: teeLon,
          green_lat: greenLat,
          green_lon: greenLon,
          hole_bearing: model?.holeBearingDeg || 0,
          approach_bearing: model?.approachBearingDeg || 0,
          green_polygon: greenFeat ? { type: 'Polygon', coordinates: [greenFeat.coords] } : null,
          bunkers_geojson: holeData.features.filter(f => f.type === 'bunker'),
          fairways_geojson: holeData.features.filter(f => f.type === 'fairway'),
          features: holeData.features,
          lidar_grid: holeData.lidarGrid
        });
      } catch (err) {
        console.warn('Neon auto-save hole warning:', err);
      }
    }, 800);
  }
}

/**
 * Loads course from Neon Postgres
 */
export async function loadCourseFromNeon(courseId: string) {
  setStatus(`Loading course data from Neon Postgres...`);
  const result = await apiClient.getCourse(courseId);
  if (!result || !result.course) {
    showToast("Could not load course from Neon database.");
    return false;
  }

  activeCourseId = result.course.id;
  activeCourseRecord = result.course;
  courseHolesStore = {};

  (document.getElementById("meta-course-name") as HTMLInputElement).value = result.course.name;
  (document.getElementById("course-search-input") as HTMLInputElement).value = `${result.course.name} (Neon Postgres)`;

  if (result.holes && result.holes.length > 0) {
    result.holes.forEach(hr => {
      const hNum = hr.hole_number;
      let feats: HoleFeature[] = [];

      if (Array.isArray(hr.features) && hr.features.length > 0) {
        feats = hr.features;
      } else {
        // Reconstruct features from PostGIS columns
        if (hr.tee_lat && hr.tee_lon) {
          feats.push({
            id: `tee-${hNum}`,
            type: 'tee',
            coords: [hr.tee_lon, hr.tee_lat],
            props: { label: 'Tee', elev: 0 }
          });
        }
        if (hr.green_polygon && hr.green_polygon.coordinates) {
          feats.push({
            id: `green-${hNum}`,
            type: 'green',
            coords: hr.green_polygon.coordinates[0],
            props: { label: '' }
          });
        }
        if (Array.isArray(hr.fairways_geojson)) {
          hr.fairways_geojson.forEach((fw: any, idx: number) => {
            const coords = fw.coordinates ? fw.coordinates[0] : (fw.coords || []);
            if (coords.length > 0) feats.push({ id: `fw-${hNum}-${idx}`, type: 'fairway', coords, props: {} });
          });
        }
        if (Array.isArray(hr.bunkers_geojson)) {
          hr.bunkers_geojson.forEach((bk: any, idx: number) => {
            const coords = bk.coordinates ? bk.coordinates[0] : (bk.coords || []);
            if (coords.length > 0) feats.push({ id: `bunk-${hNum}-${idx}`, type: 'bunker', coords, props: {} });
          });
        }
        // Centerline
        if (hr.tee_lat && hr.green_lat) {
          const clCoords = [
            [hr.tee_lon, hr.tee_lat],
            ...(hr.pivot_lat && hr.pivot_lon ? [[hr.pivot_lon, hr.pivot_lat]] : []),
            [hr.green_lon, hr.green_lat]
          ];
          feats.push({ id: `cl-${hNum}`, type: 'centerline', coords: clCoords, props: {} });
        }
      }

      courseHolesStore[hNum] = {
        meta: {
          holeNumber: hNum,
          par: hr.par || 4,
          handicap: hr.handicap,
          greenSlopeDir: 215,
          greenSlopePct: 2.8,
          courseName: result.course.name
        },
        lidarGrid: hr.lidar_grid || null,
        features: feats
      };
    });

    if (result.course.center_lat && result.course.center_lon) {
      map.setView([result.course.center_lat, result.course.center_lon], 16);
    }

    refreshHoleDropdownBadges();
    switchToHoleNumber(1);
    showToast(`Loaded ${result.holes.length} holes for ${result.course.name} from Neon Postgres!`);
    return true;
  }
  return false;
}

export function refreshHoleDropdownBadges() {
  const sel = document.getElementById("course-hole-select") as HTMLSelectElement;
  if (!sel) return;
  const curVal = sel.value || "1";
  let html = "";
  for (let h = 1; h <= 18; h++) {
    const stored = courseHolesStore[h];
    const hasGreen = stored && stored.features && stored.features.some((f) => f.type === "green");
    const hasLidar = stored && stored.lidarGrid;
    const parStr = stored?.meta?.par ? ` (Par ${stored.meta.par})` : "";
    const badge = hasLidar ? " ★" : hasGreen ? " ✓" : "";
    html += `<option value="${h}">Hole ${h}${parStr}${badge}</option>`;
  }
  sel.innerHTML = html;
  sel.value = String(curVal);
}

export function switchToHoleNumber(targetHoleNum: number) {
  persistCurrentHoleState();

  const hNum = Math.max(1, Math.min(18, targetHoleNum || 1));
  (document.getElementById("meta-hole-num") as HTMLInputElement).value = String(hNum);
  (document.getElementById("course-hole-select") as HTMLSelectElement).value = String(hNum);

  if (courseHolesStore[hNum] && courseHolesStore[hNum].features && courseHolesStore[hNum].features.length > 0) {
    holeData = JSON.parse(JSON.stringify(courseHolesStore[hNum]));
    (document.getElementById("meta-hole-par") as HTMLInputElement).value = String(holeData.meta?.par || 4);
    (document.getElementById("meta-green-slope-dir") as HTMLInputElement).value = String(holeData.meta?.greenSlopeDir || 215);
    (document.getElementById("meta-green-slope-pct") as HTMLInputElement).value = String(holeData.meta?.greenSlopePct || 2.8);
    syncMapFromState(true);
    showToast(`Switched to Hole ${hNum}`);
  } else {
    holeData = {
      meta: {
        holeNumber: hNum,
        par: 4,
        greenSlopeDir: 215,
        greenSlopePct: 2.8,
        courseName: (document.getElementById("meta-course-name") as HTMLInputElement)?.value || "Lakeview"
      },
      lidarGrid: null,
      features: []
    };
    syncMapFromState(false);
    showToast(`Hole ${hNum} is empty — zoom on map and click 'Pull OSM' or trace!`);
  }
}

function purgeDistantFeaturesIfNeeded(newCoord: [number, number]) {
  const existingTee = holeData.features.find((f) => f.type === "tee");
  if (existingTee) {
    const distMeters = turf.distance(turf.point(existingTee.coords), turf.point(newCoord), { units: "meters" });
    if (distMeters > 2500) {
      holeData.features = [];
      holeData.lidarGrid = null;
      (document.getElementById("preset-select") as HTMLSelectElement).value = "empty";
    }
  }
}

function ensureLocalTeeExists() {
  const teeFeat = holeData.features.find((f) => f.type === "tee");
  const greenFeat = holeData.features.find((f) => f.type === "green");
  const fwFeat = holeData.features.find((f) => f.type === "fairway");

  if (teeFeat) return;

  if (greenFeat && fwFeat) {
    const gCenter = turf.centroid(turf.polygon([greenFeat.coords])).geometry.coordinates;
    let maxD = -1;
    let farPt = fwFeat.coords[0];
    fwFeat.coords.forEach((c: [number, number]) => {
      const d = turf.distance(turf.point(gCenter), turf.point(c), { units: "meters" });
      if (d > maxD) {
        maxD = d;
        farPt = c;
      }
    });
    const brg = turf.bearing(turf.point(gCenter), turf.point(farPt));
    const teePt = turf.destination(turf.point(farPt), 35 * YARD_TO_M, brg, { units: "meters" }).geometry.coordinates;
    holeData.features.unshift({ id: "tee-auto", type: "tee", coords: teePt, props: { label: "Back Tee", elev: 0 } });
  } else if (greenFeat) {
    const gCenter = turf.centroid(turf.polygon([greenFeat.coords])).geometry.coordinates;
    const teePt = turf.destination(turf.point(gCenter), 360 * YARD_TO_M, 180, { units: "meters" }).geometry.coordinates;
    holeData.features.unshift({ id: "tee-auto", type: "tee", coords: teePt, props: { label: "Tee", elev: 0 } });
  }
}

/********************************************************************
 * 3. LEAFLET MAP RENDERING & INTERACTIVE VERTEX DRAGGING
 ********************************************************************/
export function syncMapFromState(fitBounds = false) {
  featureLayerGroup.clearLayers();
  handleLayerGroup.clearLayers();

  const allLatLngs: [number, number][] = [];

  holeData.features.forEach((feat) => {
    const isSelected = feat.id === selectedFeatureId;

    if (feat.type === "tee" || feat.type === "tree" || feat.type === "target") {
      const latlng: [number, number] = [feat.coords[1], feat.coords[0]];
      allLatLngs.push(latlng);

      let color = "#f43f5e";
      let radius = 7;
      if (feat.type === "tree") {
        color = "#10b981";
        radius = 9;
      } else if (feat.type === "target") {
        color = feat.props?.subtype === "cross_gold" ? "#f59e0b" : feat.props?.subtype === "edge_ring" ? "#38bdf8" : "#ef4444";
        radius = 6;
      }

      const marker = L.circleMarker(latlng, {
        radius: isSelected ? radius + 3 : radius,
        color: isSelected ? "#ffffff" : "#0f172a",
        weight: isSelected ? 3 : 2,
        fillColor: color,
        fillOpacity: 0.95
      }).addTo(featureLayerGroup);

      marker.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        selectFeature(feat.id);
      });

      const dragMarker = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({ className: "vertex-handle", iconSize: [10, 10] })
      }).addTo(handleLayerGroup);

      dragMarker.on("drag", (e: any) => {
        const pos = e.target.getLatLng();
        feat.coords = [pos.lng, pos.lat];
        marker.setLatLng(pos);
        renderYardageBookSVG();
        updateInspectorMetrics();
      });

      dragMarker.on("dragend", () => persistCurrentHoleState());
      dragMarker.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        selectFeature(feat.id);
      });
    } else if (feat.type === "centerline" || feat.type === "ob" || feat.type === "ridge") {
      const latlngs = feat.coords.map((c: [number, number]) => [c[1], c[0]]);
      if (feat.type === "centerline") allLatLngs.push(...latlngs);

      const isOB = feat.type === "ob";
      const isRidge = feat.type === "ridge";
      const line = L.polyline(latlngs, {
        color: isSelected ? "#10b981" : isOB ? "#ffffff" : isRidge ? "#fb923c" : "#fbbf24",
        weight: isSelected ? 4 : isOB ? 3 : 2.5,
        dashArray: isOB ? "8, 5" : isRidge ? "4, 4" : "6, 6"
      }).addTo(featureLayerGroup);

      line.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        selectFeature(feat.id);
      });

      feat.coords.forEach((coord: [number, number], idx: number) => {
        const vm = L.marker([coord[1], coord[0]], {
          draggable: true,
          icon: L.divIcon({ className: "vertex-handle", iconSize: [10, 10] })
        }).addTo(handleLayerGroup);

        vm.on("drag", (e: any) => {
          const pos = e.target.getLatLng();
          feat.coords[idx] = [pos.lng, pos.lat];
          line.setLatLngs(feat.coords.map((c: [number, number]) => [c[1], c[0]]));
          renderYardageBookSVG();
        });
        vm.on("dragend", () => persistCurrentHoleState());
      });
    } else {
      const ring = feat.coords.slice(0, -1);
      const latlngs = ring.map((c: [number, number]) => [c[1], c[0]]);
      allLatLngs.push(...latlngs);

      const styleMap: Record<string, any> = {
        green: { color: "#10b981", fillColor: "#34d399", fillOpacity: 0.45, weight: 2 },
        fairway: { color: "#a3e635", fillColor: "#84cc16", fillOpacity: 0.22, weight: 2 },
        bunker: { color: "#fde047", fillColor: "#fef08a", fillOpacity: 0.55, weight: 2 },
        water: { color: "#38bdf8", fillColor: "#0284c7", fillOpacity: 0.5, weight: 2 },
        crop: { color: "#e879f9", fillColor: "#d946ef", fillOpacity: 0.06, weight: 2 }
      };
      const st = styleMap[feat.type] || styleMap.fairway;

      const poly = L.polygon(latlngs, {
        color: isSelected ? "#ffffff" : st.color,
        fillColor: st.fillColor,
        fillOpacity: st.fillOpacity,
        weight: isSelected ? 3 : st.weight
      }).addTo(featureLayerGroup);

      poly.on("click", (e: any) => {
        L.DomEvent.stopPropagation(e);
        selectFeature(feat.id);
      });

      if (isSelected || feat.type === "green" || feat.type === "bunker" || feat.type === "fairway" || feat.type === "crop") {
        ring.forEach((coord: [number, number], idx: number) => {
          const vm = L.marker([coord[1], coord[0]], {
            draggable: true,
            icon: L.divIcon({ className: "vertex-handle", iconSize: [10, 10] })
          }).addTo(handleLayerGroup);

          vm.on("drag", (e: any) => {
            const pos = e.target.getLatLng();
            feat.coords[idx] = [pos.lng, pos.lat];
            feat.coords[feat.coords.length - 1] = [...feat.coords[0]];
            poly.setLatLngs(feat.coords.slice(0, -1).map((c: [number, number]) => [c[1], c[0]]));
            renderYardageBookSVG();
          });
          vm.on("dragend", () => persistCurrentHoleState());
        });
      }
    }
  });

  if (fitBounds && allLatLngs.length > 1) {
    map.fitBounds(L.latLngBounds(allLatLngs).pad(0.18));
  }

  const telLidar = document.getElementById("telemetry-lidar");
  if (telLidar) telLidar.textContent = holeData.lidarGrid ? "USGS 3DEP 1m" : "Synthetic";

  renderYardageBookSVG();
  persistCurrentHoleState();
  refreshHoleDropdownBadges();
}

/********************************************************************
 * 4. DRAWING TOOLS, FALLBACK CLICK-TO-ASSIGN & FEATURE INSPECTOR
 ********************************************************************/
export function setTool(toolName: string) {
  activeTool = toolName;
  drawingPoints = [];
  if (tempDrawingLayer) {
    map.removeLayer(tempDrawingLayer);
    tempDrawingLayer = null;
  }

  document.querySelectorAll(".tool-btn").forEach((btn: any) => {
    if (btn.dataset.tool === toolName) {
      btn.classList.add("bg-emerald-600", "text-white");
      btn.classList.remove("text-slate-300", "hover:bg-slate-800");
    } else {
      btn.classList.remove("bg-emerald-600", "text-white");
      btn.classList.add("text-slate-300", "hover:bg-slate-800");
    }
  });

  const isPolyOrLine = ["centerline", "ob", "ridge", "green", "fairway", "bunker", "water", "crop"].includes(toolName);
  document.getElementById("finish-shape-btn")?.classList.toggle("hidden", !isPolyOrLine);
  document.getElementById("map")?.classList.toggle("map-crosshair", toolName !== "select");

  const toolPrompts: Record<string, string> = {
    select: "Click any feature to inspect/nudge labels, or drag white vertex handles to reshape.",
    tee: "Click on the satellite map tee box to place the primary Tee Marker.",
    centerline: "Click Tee -> Dogleg Aim Point -> Center of Green, then click 'Complete Shape'.",
    green: "Click around the perimeter of the putting green, then click 'Complete Shape'.",
    fairway: "Click around the fairway perimeter, then click 'Complete Shape'.",
    bunker: "Click around the bunker perimeter, then click 'Complete Shape'.",
    water: "Click around the water hazard / creek perimeter, then click 'Complete Shape'.",
    tree: "Click anywhere on the map to drop a specimen Tree with automatic yardage callouts.",
    target: "Click anywhere on the fairway to drop an Aim Cross / Sprinkler Head yardage marker.",
    ridge: "Click across a fairway tier or mound slope to draw a Tour Book comb/hachure ridge line.",
    ob: "Click along an Out of Bounds line (white stakes/fence), then click 'Complete Shape'.",
    crop: "Click around a custom area to override the automatic 20-yard fairway cutout."
  };
  setStatus(toolPrompts[toolName] || "Ready.");
}

// Fallback Click Tee -> Green mode (Phase 5 requirement)
export function startFallbackHoleAssignMode() {
  fallbackModeActive = true;
  fallbackTeeMarkerCoord = null;
  setTool("select");
  setStatus("Fallback Mode: Click [1] TEE location on the map, then [2] GREEN center.");
  showToast("Click Tee location on satellite map");
}

map.on("click", (e: any) => {
  const lngLat: [number, number] = [e.latlng.lng, e.latlng.lat];

  // Handle Fallback Tee -> Green assign
  if (fallbackModeActive) {
    if (!fallbackTeeMarkerCoord) {
      fallbackTeeMarkerCoord = lngLat;
      setStatus("Tee placed! Now click the GREEN center on the map.");
      showToast("Tee set! Click Green center next");
      return;
    } else {
      const greenCoord = lngLat;
      const teeCoord = fallbackTeeMarkerCoord;
      fallbackModeActive = false;
      fallbackTeeMarkerCoord = null;

      const hNum = parseInt((document.getElementById("meta-hole-num") as HTMLInputElement).value, 10) || 1;
      const bearing = Math.round(normalizeBearing(turf.bearing(turf.point(teeCoord), turf.point(greenCoord))));
      const distYds = Math.round(turf.distance(turf.point(teeCoord), turf.point(greenCoord), { units: 'meters' }) * M_TO_YARD);

      // Check if green polygon exists nearby in cached OSM
      let matchedGreen: any = null;
      if (cachedCourseOSM && cachedCourseOSM.greens) {
        let minDist = Infinity;
        for (const g of cachedCourseOSM.greens) {
          const d = turf.distance(turf.point(greenCoord), turf.point(g.center), { units: 'meters' });
          if (d < minDist && d < 60) {
            minDist = d;
            matchedGreen = g;
          }
        }
      }

      holeData.features = [
        { id: `tee-${Date.now()}`, type: "tee", coords: teeCoord, props: { label: "Tee", elev: 0 } },
        { id: `cl-${Date.now()}`, type: "centerline", coords: [teeCoord, greenCoord], props: {} }
      ];

      if (matchedGreen) {
        holeData.features.push({
          id: matchedGreen.id,
          type: "green",
          coords: matchedGreen.coords,
          props: {}
        });
      }

      syncMapFromState(true);
      persistCurrentHoleState();
      showToast(`Hole ${hNum} mapped: ${distYds} yds, Bearing ${bearing}°! Saved to Neon.`);
      return;
    }
  }

  if (activeTool === "select") {
    selectFeature(null);
    return;
  }

  purgeDistantFeaturesIfNeeded(lngLat);

  if (activeTool === "tee") {
    const existingTee = holeData.features.find((f) => f.type === "tee");
    if (existingTee) {
      existingTee.coords = lngLat;
      selectFeature(existingTee.id);
    } else {
      const id = "tee-" + Date.now();
      holeData.features.push({ id, type: "tee", coords: lngLat, props: { label: "Tee", elev: 0 } });
      selectFeature(id);
    }
    setTool("select");
    syncMapFromState();
    showToast("Tee Marker updated.");
    return;
  }

  if (activeTool === "tree") {
    const id = "tree-" + Date.now();
    holeData.features.push({
      id,
      type: "tree",
      coords: lngLat,
      props: { label: "", elev: 0, radius: 8, dx: 0, dy: 0 }
    });
    ensureLocalTeeExists();
    selectFeature(id);
    syncMapFromState();
    showToast("Tree added with Front & Carry yardages.");
    return;
  }

  if (activeTool === "target") {
    const id = "target-" + Date.now();
    holeData.features.push({
      id,
      type: "target",
      coords: lngLat,
      props: { subtype: "cross_red", elev: 0, label: "", dx: 0, dy: 0 }
    });
    ensureLocalTeeExists();
    selectFeature(id);
    syncMapFromState();
    showToast("Aim Cross added.");
    return;
  }

  if (["centerline", "ob", "ridge", "green", "fairway", "bunker", "water", "crop"].includes(activeTool)) {
    drawingPoints.push(lngLat);
    if (tempDrawingLayer) map.removeLayer(tempDrawingLayer);

    const latlngs = drawingPoints.map((c) => [c[1], c[0]]);
    if (activeTool === "centerline" || activeTool === "ob" || activeTool === "ridge") {
      tempDrawingLayer = L.polyline(latlngs, {
        color: activeTool === "ob" ? "#ffffff" : activeTool === "ridge" ? "#fb923c" : "#fbbf24",
        weight: 3,
        dashArray: "5,5"
      }).addTo(map);
    } else {
      tempDrawingLayer = L.polygon(latlngs, {
        color: activeTool === "crop" ? "#e879f9" : "#10b981",
        weight: 2,
        fillOpacity: activeTool === "crop" ? 0.08 : 0.3
      }).addTo(map);
    }
    setStatus(`Tracing ${activeTool.toUpperCase()}: ${drawingPoints.length} points placed. Click 'Complete Shape' or press Enter.`);
  }
});

export function finishActiveShape() {
  if (!["centerline", "ob", "ridge", "green", "fairway", "bunker", "water", "crop"].includes(activeTool)) return;
  const isLine = activeTool === "centerline" || activeTool === "ob" || activeTool === "ridge";
  const minPts = isLine ? 2 : 3;
  if (drawingPoints.length < minPts) {
    showToast(`Add at least ${minPts} points to complete ${activeTool}.`);
    return;
  }

  purgeDistantFeaturesIfNeeded(drawingPoints[0] as [number, number]);

  const id = `${activeTool}-${Date.now()}`;
  if (activeTool === "centerline") {
    holeData.features = holeData.features.filter((f) => f.type !== "centerline");
    holeData.features.push({ id, type: "centerline", coords: [...drawingPoints], props: {} });
    const existingTee = holeData.features.find((f) => f.type === "tee");
    if (!existingTee) {
      holeData.features.unshift({ id: "tee-from-cl", type: "tee", coords: [...drawingPoints[0]], props: { label: "Tee", elev: 0 } });
    }
  } else if (activeTool === "ob") {
    holeData.features.push({ id, type: "ob", coords: [...drawingPoints], props: { label: "O.B." } });
    ensureLocalTeeExists();
  } else if (activeTool === "ridge") {
    holeData.features.push({ id, type: "ridge", coords: [...drawingPoints], props: { label: "" } });
    ensureLocalTeeExists();
  } else {
    if (activeTool === "green") {
      holeData.features = holeData.features.filter((f) => f.type !== "green");
      holeData.lidarGrid = null;
    } else if (activeTool === "crop") {
      holeData.features = holeData.features.filter((f) => f.type !== "crop");
    }
    const closed = [...drawingPoints, [...drawingPoints[0]]];
    holeData.features.push({ id, type: activeTool, coords: closed, props: { label: "" } });
    ensureLocalTeeExists();
  }

  if (tempDrawingLayer) {
    map.removeLayer(tempDrawingLayer);
    tempDrawingLayer = null;
  }
  drawingPoints = [];
  setTool("select");
  selectFeature(id);
  syncMapFromState();
  showToast(`${activeTool.toUpperCase()} vector saved.`);
}

export function selectFeature(id: string | null) {
  selectedFeatureId = id;
  const inspector = document.getElementById("feature-inspector");
  const delBtn = document.getElementById("delete-selected-btn") as HTMLButtonElement;
  const feat = holeData.features.find((f) => f.id === id);

  if (!feat || !inspector) {
    if (inspector) inspector.classList.add("hidden");
    if (delBtn) delBtn.disabled = true;
    syncMapFromState();
    return;
  }

  delBtn.disabled = false;
  inspector.classList.remove("hidden");
  (document.getElementById("inspector-title") as HTMLElement).textContent = `${feat.type.toUpperCase()} PROPERTIES`;
  (document.getElementById("prop-label") as HTMLInputElement).value = feat.props?.label || "";
  (document.getElementById("prop-elev") as HTMLInputElement).value = feat.props?.elev ?? "";
  (document.getElementById("prop-radius") as HTMLInputElement).value = String(feat.props?.radius ?? 8);
  (document.getElementById("prop-dx") as HTMLInputElement).value = String(feat.props?.dx ?? 0);
  (document.getElementById("prop-dy") as HTMLInputElement).value = String(feat.props?.dy ?? 0);
  (document.getElementById("prop-subtype") as HTMLSelectElement).value = feat.props?.subtype || "cross_red";

  document.getElementById("prop-radius-wrap")?.classList.toggle("hidden", feat.type !== "tree");
  document.getElementById("prop-marker-type-wrap")?.classList.toggle("hidden", feat.type !== "target");

  updateInspectorMetrics();
  syncMapFromState();
}

export function updateInspectorMetrics() {
  const feat = holeData.features.find((f) => f.id === selectedFeatureId);
  const metricsEl = document.getElementById("inspector-metrics");
  if (!feat || !(window as any).__lastSpatialModel || !metricsEl) return;
  const { teeCoord, frontGreenCoord } = (window as any).__lastSpatialModel;
  let samplePt = Array.isArray(feat.coords[0]) ? feat.coords[0] : feat.coords;
  const carry = Math.round(turf.distance(turf.point(teeCoord), turf.point(samplePt), { units: "meters" }) * M_TO_YARD);
  const toFront = Math.round(turf.distance(turf.point(frontGreenCoord), turf.point(samplePt), { units: "meters" }) * M_TO_YARD);
  metricsEl.textContent = `Carry: ${carry}y | To Front: ${toFront}y`;
}

export function deleteSelectedFeature() {
  if (!selectedFeatureId) return;
  holeData.features = holeData.features.filter((f) => f.id !== selectedFeatureId);
  selectedFeatureId = null;
  document.getElementById("feature-inspector")?.classList.add("hidden");
  const delBtn = document.getElementById("delete-selected-btn") as HTMLButtonElement;
  if (delBtn) delBtn.disabled = true;
  syncMapFromState();
  showToast("Feature removed.");
}

/********************************************************************
 * 5. COURSE SEARCH & OVERPASS DATA FETCHING (WIRED TO NEON POSTGRES)
 ********************************************************************/
async function fetchOverpassWithFallback(query: string) {
  const mirrors = [
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
    `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`,
    `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
  ];
  for (const url of mirrors) {
    try {
      const res = await fetch(url, { method: "GET", mode: "cors" });
      if (res.ok) {
        const json = await res.json();
        if (json && json.elements) return json;
      }
    } catch (err) {
      console.warn("Overpass mirror failed:", url);
    }
  }
  return null;
}

export async function cacheAll18HolesFromOverpass(lat: number, lon: number, courseName: string, city: string = "", state: string = "ID") {
  setStatus(`Fetching Overpass OSM vectors and saving to Neon Postgres...`);
  showToast(`Pulling & saving 18 holes to Neon for ${courseName}...`);

  const query = getOverpassQuery(lat, lon, 2200);
  const osm = await fetchOverpassWithFallback(query);

  if (!osm || !osm.elements) {
    showToast("Overpass busy — zoom closer and click 'Pull OSM' or trace manually.");
    return;
  }

  try {
    // Phase 4 & 5: POST to /api/courses which runs spatial join and bulk-upserts 18 holes to Neon
    const saveRes = await apiClient.saveCourseWithOsm({
      name: courseName,
      city,
      state,
      center_lat: lat,
      center_lon: lon,
      osmData: osm
    });

    if (saveRes.success && saveRes.course) {
      activeCourseId = saveRes.course.id;
      activeCourseRecord = saveRes.course;
      await loadCourseFromNeon(saveRes.course.id);
      showToast(`Successfully saved 18 holes for ${courseName} directly to Neon Postgres!`);
    } else {
      showToast("Course processed locally.");
    }
  } catch (err: any) {
    console.error("Save to Neon failed:", err);
    showToast(`Neon save notice: ${err.message}`);
  }
}

export async function runCourseSearch() {
  const searchInput = document.getElementById("course-search-input") as HTMLInputElement;
  const resultsDropdown = document.getElementById("course-search-results");
  if (!searchInput || !resultsDropdown) return;
  const rawQuery = searchInput.value.trim();
  if (!rawQuery) return;

  resultsDropdown.classList.remove("hidden");
  resultsDropdown.innerHTML = `
    <div class="px-3.5 py-3 text-xs text-slate-400 flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
      <span>Searching Neon database & OpenStreetMap for "${rawQuery}"...</span>
    </div>
  `;

  // 1. Check Neon Postgres first for already saved courses!
  const savedCourses = await apiClient.getCourses();
  const matchedSaved = savedCourses.filter(c => c.name.toLowerCase().includes(rawQuery.toLowerCase()));

  // 2. Search Nominatim
  let osmCourses: any[] = [];
  try {
    const isZip = /^\d{5}(-\d{4})?$/.test(rawQuery);
    if (!isZip) {
      const golfQuery = /golf|country club|links|cc|gc/i.test(rawQuery) ? rawQuery : `${rawQuery} golf`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(golfQuery)}&addressdetails=1&extratags=1&limit=10`;
      const res = await fetch(url);
      const data = await res.json();
      osmCourses = (data || []).map((item: any) => {
        const addr = item.address || {};
        const name = item.name || addr.golf_course || addr.leisure || item.display_name.split(",")[0];
        const city = addr.city || addr.town || addr.village || addr.municipality || "";
        const state = addr.state || "";
        return {
          name, city, state,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          badge: "OpenStreetMap"
        };
      });
    }
  } catch (e) { }

  renderCourseDropdown(matchedSaved, osmCourses, rawQuery);
}

function renderCourseDropdown(savedCourses: CourseRecord[], osmCourses: any[], query: string) {
  const resultsDropdown = document.getElementById("course-search-results");
  if (!resultsDropdown) return;

  if (savedCourses.length === 0 && osmCourses.length === 0) {
    resultsDropdown.innerHTML = `<div class="px-3.5 py-3 text-xs text-slate-400">No courses found for "<strong>${query}</strong>".</div>`;
    return;
  }

  let html = "";

  if (savedCourses.length > 0) {
    html += `<div class="px-3 py-1 text-[10px] font-bold uppercase text-emerald-400 bg-slate-950/80">Saved in Neon Postgres</div>`;
    savedCourses.forEach(c => {
      html += `
        <button type="button" data-neon-id="${c.id}" class="neon-course-item w-full text-left px-3.5 py-2.5 hover:bg-slate-800 transition flex items-center justify-between gap-3 group">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-emerald-300 group-hover:text-emerald-200 truncate">${c.name}</div>
            <div class="text-[11px] text-slate-400 truncate">${[c.city, c.state].filter(Boolean).join(", ")} • ${c.holes_count || 18} Holes Live</div>
          </div>
          <span class="shrink-0 text-[10px] font-mono-code px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Neon DB</span>
        </button>
      `;
    });
  }

  if (osmCourses.length > 0) {
    html += `<div class="px-3 py-1 text-[10px] font-bold uppercase text-indigo-400 bg-slate-950/80">OpenStreetMap Worldwide</div>`;
    osmCourses.forEach((c, idx) => {
      html += `
        <button type="button" data-osm-idx="${idx}" class="osm-course-item w-full text-left px-3.5 py-2.5 hover:bg-slate-800 transition flex items-center justify-between gap-3 group">
          <div class="min-w-0">
            <div class="text-xs font-semibold text-white group-hover:text-emerald-400 truncate">${c.name}</div>
            <div class="text-[11px] text-slate-400 truncate">${[c.city, c.state].filter(Boolean).join(", ")}</div>
          </div>
          <span class="shrink-0 text-[10px] font-mono-code px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">Import OSM</span>
        </button>
      `;
    });
  }

  resultsDropdown.innerHTML = html;

  resultsDropdown.querySelectorAll(".neon-course-item").forEach((btn: any) => {
    btn.addEventListener("click", async () => {
      const courseId = btn.dataset.neonId;
      resultsDropdown.classList.add("hidden");
      await loadCourseFromNeon(courseId);
    });
  });

  resultsDropdown.querySelectorAll(".osm-course-item").forEach((btn: any) => {
    btn.addEventListener("click", async () => {
      const chosen = osmCourses[parseInt(btn.dataset.osmIdx, 10)];
      if (!chosen) return;
      resultsDropdown.classList.add("hidden");
      (document.getElementById("course-search-input") as HTMLInputElement).value = chosen.name;
      const cleanName = chosen.name.replace(/Golf Course|Golf Club|Country Club|GC|CC/gi, "").trim() || chosen.name;
      (document.getElementById("meta-course-name") as HTMLInputElement).value = cleanName;
      map.setView([chosen.lat, chosen.lon], 16);
      await cacheAll18HolesFromOverpass(chosen.lat, chosen.lon, cleanName, chosen.city, chosen.state);
    });
  });
}

/********************************************************************
 * 6. DUAL-BEARING SPATIAL MODEL & SVG YARDAGE BOOK RENDERER
 ********************************************************************/
export function computeSpatialHoleModel() {
  const teeFeat = holeData.features.find((f) => f.type === "tee");
  const greenFeat = holeData.features.find((f) => f.type === "green");
  const fwFeat = holeData.features.find((f) => f.type === "fairway");
  const centerFeat = holeData.features.find((f) => f.type === "centerline");

  const mapCenter = map.getCenter();
  let greenCentroidCoord: [number, number] = [mapCenter.lng, mapCenter.lat + 0.0015];
  let greenPolyTurf: any = null;

  if (greenFeat && greenFeat.coords.length >= 4) {
    greenPolyTurf = turf.polygon([greenFeat.coords]);
    greenCentroidCoord = turf.centroid(greenPolyTurf).geometry.coordinates as [number, number];
  } else if (centerFeat && centerFeat.coords.length >= 2) {
    greenCentroidCoord = centerFeat.coords[centerFeat.coords.length - 1];
  } else if (fwFeat && fwFeat.coords.length >= 4) {
    greenCentroidCoord = turf.centroid(turf.polygon([fwFeat.coords])).geometry.coordinates as [number, number];
  }

  let teeCoord: [number, number] | null = teeFeat ? teeFeat.coords : null;
  if (!teeCoord) {
    if (centerFeat && centerFeat.coords.length >= 2) {
      teeCoord = centerFeat.coords[0];
    } else {
      teeCoord = turf.destination(turf.point(greenCentroidCoord), 360 * YARD_TO_M, 180, { units: "meters" }).geometry.coordinates as [number, number];
    }
  }

  const holeBearingDeg = (turf.bearing(turf.point(teeCoord), turf.point(greenCentroidCoord)) + 360) % 360;

  let approachOriginCoord = teeCoord;
  if (centerFeat && centerFeat.coords.length >= 3) {
    for (let i = centerFeat.coords.length - 2; i >= 0; i--) {
      const dToGreen = turf.distance(turf.point(centerFeat.coords[i]), turf.point(greenCentroidCoord), { units: "meters" }) * M_TO_YARD;
      if (dToGreen >= 35) {
        approachOriginCoord = centerFeat.coords[i];
        break;
      }
    }
  }
  const approachBearingDeg = (turf.bearing(turf.point(approachOriginCoord), turf.point(greenCentroidCoord)) + 360) % 360;

  let frontGreenCoord: [number, number] = [...greenCentroidCoord];
  if (greenPolyTurf) {
    const approachLine = turf.lineString([approachOriginCoord, greenCentroidCoord]);
    const greenBoundary = turf.polygonToLine(greenPolyTurf);
    const intersections = turf.lineIntersect(approachLine, greenBoundary);
    if (intersections && intersections.features.length > 0) {
      let minDist = Infinity;
      intersections.features.forEach((ptFeat: any) => {
        const d = turf.distance(turf.point(approachOriginCoord), ptFeat, { units: "meters" });
        if (d < minDist) {
          minDist = d;
          frontGreenCoord = ptFeat.geometry.coordinates as [number, number];
        }
      });
    }
  }

  function projectToHoleYards(coord: [number, number]) {
    const distYards = turf.distance(turf.point(teeCoord!), turf.point(coord), { units: "meters" }) * M_TO_YARD;
    if (distYards < 0.01) return { x: 0, y: 0 };
    const ptBearing = turf.bearing(turf.point(teeCoord!), turf.point(coord));
    const relAngleRad = ((ptBearing - holeBearingDeg) * Math.PI) / 180;
    return {
      x: distYards * Math.sin(relAngleRad),
      y: distYards * Math.cos(relAngleRad)
    };
  }

  const frontGreenXY = projectToHoleYards(frontGreenCoord);
  const greenCenterXY = projectToHoleYards(greenCentroidCoord);

  let totalHoleYards = Math.round(turf.distance(turf.point(teeCoord), turf.point(greenCentroidCoord), { units: "meters" }) * M_TO_YARD);
  if (centerFeat && centerFeat.coords.length >= 2) {
    totalHoleYards = Math.round(turf.length(turf.lineString(centerFeat.coords), { units: "meters" }) * M_TO_YARD);
  }

  let greenDepthYards = 30;
  let backGreenXY = { x: greenCenterXY.x, y: frontGreenXY.y + 30 };
  if (greenFeat && greenFeat.coords.length >= 4) {
    let maxY = -Infinity;
    greenFeat.coords.forEach((c: [number, number]) => {
      const p = projectToHoleYards(c);
      if (p.y > maxY) { maxY = p.y; backGreenXY = p; }
    });
    greenDepthYards = Math.max(10, Math.round(maxY - frontGreenXY.y));
  }

  (document.getElementById("telemetry-bearing") as HTMLElement).textContent = `${Math.round(holeBearingDeg)}°`;
  (document.getElementById("telemetry-app-bearing") as HTMLElement).textContent = `${Math.round(approachBearingDeg)}°`;
  (document.getElementById("telemetry-length") as HTMLElement).textContent = `${totalHoleYards}y`;
  (document.getElementById("telemetry-depth") as HTMLElement).textContent = `${greenDepthYards}y`;

  const model = {
    teeCoord,
    frontGreenCoord,
    greenCentroidCoord,
    holeBearingDeg,
    approachBearingDeg,
    frontGreenXY,
    greenCenterXY,
    backGreenXY,
    totalHoleYards,
    greenDepthYards,
    projectToHoleYards,
    yardsFromTee: (coord: [number, number]) => Math.round(turf.distance(turf.point(teeCoord!), turf.point(coord), { units: "meters" }) * M_TO_YARD),
    yardsToFrontGreen: (coord: [number, number]) => Math.round(turf.distance(turf.point(frontGreenCoord), turf.point(coord), { units: "meters" }) * M_TO_YARD)
  };

  (window as any).__lastSpatialModel = model;
  return model;
}

function catmullRomSplinePath(pts: Array<{ sx: number; sy: number }>, closed: boolean = false, tension: number = 0.22): string {
  if (!pts || pts.length < 2) return "";
  if (pts.length === 2) {
    return `M ${pts[0].sx.toFixed(1)} ${pts[0].sy.toFixed(1)} L ${pts[1].sx.toFixed(1)} ${pts[1].sy.toFixed(1)}`;
  }
  const list = closed ? [...pts.slice(0, -1)] : [...pts];
  const n = list.length;
  let d = `M ${list[0].sx.toFixed(1)} ${list[0].sy.toFixed(1)}`;

  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = list[(i - 1 + n) % n];
    const p1 = list[i % n];
    const p2 = list[(i + 1) % n];
    const p3 = list[(i + 2) % n];

    const cp1x = p1.sx + (p2.sx - p0.sx) * tension;
    const cp1y = p1.sy + (p2.sy - p0.sy) * tension;
    const cp2x = p2.sx - (p3.sx - p1.sx) * tension;
    const cp2y = p2.sy - (p3.sy - p1.sy) * tension;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.sx.toFixed(1)} ${p2.sy.toFixed(1)}`;
  }
  if (closed) d += " Z";
  return d;
}

function renderMoundHachuresSVG(screenPts: Array<{ sx: number; sy: number }>, tickLen: number = 7, spacing: number = 8, outward: boolean = true): string {
  if (!showHachures || screenPts.length < 2) return "";
  let out = "";
  for (let i = 0; i < screenPts.length - 1; i++) {
    const p1 = screenPts[i];
    const p2 = screenPts[i + 1];
    const segLen = Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy);
    const steps = Math.max(1, Math.floor(segLen / spacing));
    const nx = ((p2.sy - p1.sy) / (segLen || 1)) * (outward ? 1 : -1);
    const ny = (-(p2.sx - p1.sx) / (segLen || 1)) * (outward ? 1 : -1);

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const bx = p1.sx + (p2.sx - p1.sx) * t;
      const by = p1.sy + (p2.sy - p1.sy) * t;
      const lenVar = tickLen * (0.75 + 0.45 * Math.sin(i * 3 + s));
      const ex = bx + nx * lenVar;
      const ey = by + ny * lenVar;
      out += `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#57534e" stroke-width="0.65" opacity="0.65" />`;
    }
  }
  return out;
}

function renderTreeCanopySVG(cx: number, cy: number, radiusPx: number): string {
  const r = Math.max(10, radiusPx);
  let lobes = "";
  const lobeCount = 9;
  for (let i = 0; i < lobeCount; i++) {
    const ang = (i * 2 * Math.PI) / lobeCount;
    const lx = cx + Math.cos(ang) * (r * 0.42);
    const ly = cy + Math.sin(ang) * (r * 0.42);
    lobes += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${(r * 0.58).toFixed(1)}" fill="#b6ad99" fill-opacity="0.38" />`;
  }
  return `
    <g class="tour-tree">
      ${lobes}
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r * 0.85).toFixed(1)}" fill="none" stroke="#78716c" stroke-width="0.7" stroke-dasharray="2,2" opacity="0.7" />
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.8" fill="#44403c" />
    </g>
  `;
}

function renderStackedYardageSVG(x: number, y: number, frontYds: number, carryYds: number | null, elev: number = 0, label: string = "", align: string = "center"): string {
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const elevStr = elev && elev !== 0 ? (elev > 0 ? `+${elev}` : `${elev}`) : "";

  return `
    <g class="yardage-callout" transform="translate(${x.toFixed(1)}, ${y.toFixed(1)})">
      ${elevStr ? `<text x="0" y="-13" text-anchor="${anchor}" class="font-tour" font-size="9.5" font-weight="600" fill="#1c1917" stroke="#faf8f2" stroke-width="2.5" paint-order="stroke">${elevStr}</text>` : ""}
      <text x="0" y="0" text-anchor="${anchor}" class="font-tour" font-size="15.5" font-weight="700" fill="#111827" stroke="#faf8f2" stroke-width="3" paint-order="stroke">${frontYds}</text>
      ${carryYds ? `<text x="0" y="10.5" text-anchor="${anchor}" class="font-tour" font-size="11" font-weight="600" fill="#b91c1c" stroke="#faf8f2" stroke-width="2.5" paint-order="stroke">${carryYds}</text>` : ""}
      ${label ? `<text x="0" y="${carryYds ? 19.5 : 10}" text-anchor="${anchor}" font-family="Inter, sans-serif" font-size="8.5" font-style="italic" font-weight="600" fill="#44403c" stroke="#faf8f2" stroke-width="2" paint-order="stroke">${label}</text>` : ""}
    </g>
  `;
}

function renderCompassRoseSVG(cx: number, cy: number, bearingUpDeg: number, scale: number = 1): string {
  const northRotation = -bearingUpDeg;
  return `
    <g transform="translate(${cx}, ${cy}) scale(${scale}) rotate(${northRotation.toFixed(1)})">
      <line x1="0" y1="18" x2="0" y2="-22" stroke="#1c1917" stroke-width="1.3" />
      <line x1="-14" y1="0" x2="14" y2="0" stroke="#1c1917" stroke-width="1" />
      <polygon points="0,-25 -4.5,-13 0,-16 4.5,-13" fill="#1c1917" />
      <circle cx="0" cy="0" r="3" fill="#faf8f2" stroke="#1c1917" stroke-width="1.1" />
      <text x="0" y="-28" text-anchor="middle" class="font-tour" font-size="8.5" font-weight="700" fill="#1c1917">N</text>
    </g>
  `;
}

function renderGreenWithProjection(model: any, toScreen: (p: { x: number; y: number }) => { sx: number; sy: number }, clipId: string = "green-clip-main"): string {
  const greenFeat = holeData.features.find((f) => f.type === "green");
  if (!greenFeat || greenFeat.coords.length < 4) return "";

  const greenPtsYards = greenFeat.coords.map((c: [number, number]) => model.projectToHoleYards(c));
  const minX = Math.min(...greenPtsYards.map((p: any) => p.x)) - 4;
  const maxX = Math.max(...greenPtsYards.map((p: any) => p.x)) + 4;
  const minY = Math.min(...greenPtsYards.map((p: any) => p.y)) - 2;
  const maxY = Math.max(...greenPtsYards.map((p: any) => p.y)) + 2;

  const greenScreenPts = greenPtsYards.map(toScreen);
  const greenPathD = catmullRomSplinePath(greenScreenPts, true, 0.2);

  let gridLines = "";
  for (let gx = Math.floor(minX / 5) * 5; gx <= Math.ceil(maxX / 5) * 5; gx += 5) {
    const p1 = toScreen({ x: gx, y: minY });
    const p2 = toScreen({ x: gx, y: maxY });
    gridLines += `<line x1="${p1.sx.toFixed(1)}" y1="${p1.sy.toFixed(1)}" x2="${p2.sx.toFixed(1)}" y2="${p2.sy.toFixed(1)}" stroke="#78716c" stroke-width="0.45" opacity="0.55" />`;
  }
  for (let gy = Math.floor(minY / 5) * 5; gy <= Math.ceil(maxY / 5) * 5; gy += 5) {
    const p1 = toScreen({ x: minX, y: gy });
    const p2 = toScreen({ x: maxX, y: gy });
    gridLines += `<line x1="${p1.sx.toFixed(1)}" y1="${p1.sy.toFixed(1)}" x2="${p2.sx.toFixed(1)}" y2="${p2.sy.toFixed(1)}" stroke="#78716c" stroke-width="0.45" opacity="0.55" />`;
  }

  let slopeArrows = "";
  const slopeDirDeg = parseFloat((document.getElementById("meta-green-slope-dir") as HTMLInputElement)?.value) || 215;
  const slopePct = parseFloat((document.getElementById("meta-green-slope-pct") as HTMLInputElement)?.value) || 2.8;

  for (let gx = minX + 2; gx <= maxX - 2; gx += 4.5) {
    for (let gy = minY + 2; gy <= maxY - 2; gy += 4.5) {
      const sPt = toScreen({ x: gx, y: gy });
      const arrowLen = Math.min(14, 7 + slopePct * 1.5);
      slopeArrows += `
        <g transform="translate(${sPt.sx.toFixed(1)}, ${sPt.sy.toFixed(1)}) rotate(${slopeDirDeg})">
          <line x1="0" y1="${(arrowLen / 2).toFixed(1)}" x2="0" y2="${(-arrowLen / 2).toFixed(1)}" stroke="#292524" stroke-width="0.85" opacity="0.88" />
          <polygon points="0,${(-arrowLen / 2 - 2).toFixed(1)} -2,${(-arrowLen / 2 + 2).toFixed(1)} 2,${(-arrowLen / 2 + 2).toFixed(1)}" fill="#292524" opacity="0.88" />
        </g>
      `;
    }
  }

  return `
    <g class="green-complex-group">
      <defs><clipPath id="${clipId}"><path d="${greenPathD}" /></clipPath></defs>
      ${renderMoundHachuresSVG(greenScreenPts, 7, 8, true)}
      <path d="${greenPathD}" fill="#eef2eb" stroke="#faf8f2" stroke-width="1.5" />
      <g clip-path="url(#${clipId})">${gridLines}${slopeArrows}</g>
      <path d="${greenPathD}" fill="none" stroke="#1c1917" stroke-width="1.5" />
    </g>
  `;
}

export function renderYardageBookSVG() {
  const svg = document.getElementById("yardage-book-svg");
  if (!svg) return;
  const model = computeSpatialHoleModel();

  const holeNum = (document.getElementById("meta-hole-num") as HTMLInputElement)?.value || "1";
  const holePar = (document.getElementById("meta-hole-par") as HTMLInputElement)?.value || "4";

  svg.setAttribute("viewBox", "0 0 540 940");

  const plotMinY = Math.max(30, model.frontGreenXY.y - 180);
  const yNeck = model.frontGreenXY.y - 6;
  const greenPxPerYard = 4.2;
  const actualFwPxPerYard = 2.4;
  const syNeck = 270;

  function yardsToPage(ptYards: { x: number; y: number }) {
    const dyFromNeck = ptYards.y - yNeck;
    let sy: number;
    if (dyFromNeck >= 0) {
      sy = syNeck - dyFromNeck * greenPxPerYard;
    } else {
      sy = syNeck - dyFromNeck * actualFwPxPerYard;
    }
    return {
      sx: 270 + ptYards.x * actualFwPxPerYard,
      sy
    };
  }

  let svgContent = `
    <rect x="0" y="0" width="540" height="940" fill="#faf8f2" />
  `;

  // Fairways
  holeData.features.filter(f => f.type === "fairway").forEach(fw => {
    const pts = fw.coords.map((c: [number, number]) => yardsToPage(model.projectToHoleYards(c)));
    const d = catmullRomSplinePath(pts, true, 0.22);
    svgContent += `<path d="${d}" fill="#faf8f2" stroke="#1c1917" stroke-width="1.55" />`;
  });

  // Green
  svgContent += renderGreenWithProjection(model, yardsToPage, "green-clip-unified");

  // Bunkers
  holeData.features.filter(f => f.type === "bunker").forEach(bk => {
    const pts = bk.coords.map((c: [number, number]) => yardsToPage(model.projectToHoleYards(c)));
    const d = catmullRomSplinePath(pts, true, 0.22);
    svgContent += `
      <path d="${d}" fill="#f1e6b2" stroke="#1c1917" stroke-width="1.25" />
    `;
  });

  // Trees
  holeData.features.filter(f => f.type === "tree").forEach(tr => {
    const sPt = yardsToPage(model.projectToHoleYards(tr.coords));
    svgContent += renderTreeCanopySVG(sPt.sx, sPt.sy, 16);
    svgContent += renderStackedYardageSVG(sPt.sx, sPt.sy + 5, model.yardsToFrontGreen(tr.coords), model.yardsFromTee(tr.coords));
  });

  // Targets
  holeData.features.filter(f => f.type === "target").forEach(tg => {
    const sPt = yardsToPage(model.projectToHoleYards(tg.coords));
    svgContent += `
      <circle cx="${sPt.sx}" cy="${sPt.sy}" r="3" fill="#dc2626" />
      ${renderStackedYardageSVG(sPt.sx, sPt.sy, model.yardsToFrontGreen(tg.coords), model.yardsFromTee(tg.coords))}
    `;
  });

  // Title block
  svgContent += `
    <g transform="translate(88, 868)">
      <text x="0" y="0" text-anchor="middle" class="font-tour" font-size="48" font-weight="700" fill="#1c1917">${holeNum}</text>
      <text x="0" y="18" text-anchor="middle" class="font-tour" font-size="15" font-weight="600" fill="#292524">${model.totalHoleYards} Yds</text>
      <text x="0" y="33" text-anchor="middle" class="font-tour" font-size="13" font-weight="500" fill="#44403c">Par ${holePar}</text>
    </g>
    ${renderCompassRoseSVG(468, 875, model.holeBearingDeg, 1.0)}
    <rect x="8" y="8" width="524" height="924" fill="none" stroke="#d6d3d1" stroke-width="1" />
  `;

  svg.innerHTML = svgContent;
}

/********************************************************************
 * 7. INITIALIZATION & DOM EVENTS
 ********************************************************************/
window.addEventListener("DOMContentLoaded", async () => {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }

  // Setup toolbar tool buttons
  document.querySelectorAll(".tool-btn").forEach((btn: any) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  // Setup Course Search & Buttons
  document.getElementById("course-search-btn")?.addEventListener("click", runCourseSearch);
  document.getElementById("course-search-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runCourseSearch();
  });

  document.getElementById("course-hole-select")?.addEventListener("change", (e: any) => {
    switchToHoleNumber(parseInt(e.target.value, 10));
  });

  document.getElementById("finish-shape-btn")?.addEventListener("click", finishActiveShape);
  document.getElementById("delete-selected-btn")?.addEventListener("click", deleteSelectedFeature);
  document.getElementById("close-inspector-btn")?.addEventListener("click", () => selectFeature(null));

  // Connect Fallback Mode Button
  const fallbackBtn = document.createElement("button");
  fallbackBtn.id = "fallback-map-hole-btn";
  fallbackBtn.className = "p-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white transition text-xs flex items-center gap-1 shrink-0";
  fallbackBtn.title = "Fallback Mode: Click Tee -> Green on map to assign this hole";
  fallbackBtn.innerHTML = `<i data-lucide="target" class="w-3.5 h-3.5"></i><span class="hidden md:inline">Map Hole</span>`;
  fallbackBtn.addEventListener("click", startFallbackHoleAssignMode);
  document.getElementById("osm-import-btn")?.parentNode?.insertBefore(fallbackBtn, document.getElementById("osm-import-btn"));

  // Check Neon Postgres for existing saved courses on boot!
  setStatus("Connecting to Neon Postgres database...");
  try {
    const saved = await apiClient.getCourses();
    if (saved.length > 0) {
      console.log(`Found ${saved.length} courses in Neon Postgres`);
      await loadCourseFromNeon(saved[0].id);
      showToast(`Loaded ${saved[0].name} from Neon Postgres!`);
    } else {
      syncMapFromState(true);
      setStatus("Connected to Neon PostGIS. Search course name or zip above.");
    }
  } catch (e) {
    syncMapFromState(true);
  }
});
