import fs from 'fs';

const html = fs.readFileSync('tour_yardage_book_studio.html', 'utf8');
const scriptStartTag = '<script>';
const scriptEndTag = '</script>';

const startIdx = html.indexOf(scriptStartTag) + scriptStartTag.length;
const endIdx = html.lastIndexOf(scriptEndTag);

if (startIdx === -1 || endIdx === -1) {
  throw new Error('Could not find <script> tags in tour_yardage_book_studio.html');
}

let jsCode = html.slice(startIdx, endIdx);

// TypeScript headers and imports
const header = `// @ts-nocheck
import { apiClient } from './api-client';

declare const L: any;
declare const turf: any;
declare const lucide: any;

let activeNeonCourseId: string | null = null;
let saveToNeonTimer: any = null;
`;

// 1. Enhance saveStateToLocalStorage to also sync to Neon Postgres
const neonSaveHook = `
    function syncHoleToNeon() {
      if (!activeNeonCourseId) return;
      clearTimeout(saveToNeonTimer);
      saveToNeonTimer = setTimeout(async () => {
        try {
          const curHNum = parseInt(document.getElementById("meta-hole-num").value, 10) || 1;
          const teeFeat = holeData.features.find(f => f.type === 'tee');
          const greenFeat = holeData.features.find(f => f.type === 'green');
          const clFeat = holeData.features.find(f => f.type === 'centerline');
          const model = window.__lastSpatialModel;

          const teeLat = teeFeat ? teeFeat.coords[1] : (clFeat ? clFeat.coords[0][1] : 0);
          const teeLon = teeFeat ? teeFeat.coords[0] : (clFeat ? clFeat.coords[0][0] : 0);
          const greenLat = greenFeat ? turf.centroid(turf.polygon([greenFeat.coords])).geometry.coordinates[1] : 0;
          const greenLon = greenFeat ? turf.centroid(turf.polygon([greenFeat.coords])).geometry.coordinates[0] : 0;

          await apiClient.saveHole({
            course_id: activeNeonCourseId,
            hole_number: curHNum,
            par: holeData.meta?.par || 4,
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
        } catch (e) {
          console.warn("Neon auto-save hole error:", e);
        }
      }, 700);
    }
`;

// Insert neonSaveHook after saveStateToLocalStorage function definition
jsCode = jsCode.replace(
  'function saveStateToLocalStorage() {',
  neonSaveHook + '\n    function saveStateToLocalStorage() {\n      syncHoleToNeon();'
);

// 2. Enhance cacheAll18HolesFromOverpass to also save full OSM course to Neon
const neonCourseSaveCall = `
      // Sync full course to Neon Postgres in background
      try {
        apiClient.saveCourseWithOsm({
          name: courseName,
          center_lat: lat,
          center_lon: lon,
          osmData: osm
        }).then(res => {
          if (res && res.course) {
            activeNeonCourseId = res.course.id;
            console.log("Persisted full course to Neon Postgres:", res.course.id);
            showToast("Course and 18 holes saved to Neon Postgres!");
          }
        }).catch(err => console.warn("Neon course save notice:", err));
      } catch (e) { }
`;

jsCode = jsCode.replace(
  'courseHolesStore = {};',
  'courseHolesStore = {};\n' + neonCourseSaveCall
);

// 3. Enhance DOMContentLoaded to check Neon Postgres on load
const neonBootCheck = `
      // Check Neon Postgres on boot
      apiClient.getCourses().then(async (neonCourses) => {
        if (neonCourses && neonCourses.length > 0) {
          console.log("Neon Postgres courses available:", neonCourses.length);
          const restored = loadStateFromLocalStorage();
          if (!restored) {
            // Load latest course from Neon if local storage is blank
            const first = neonCourses[0];
            const fullCourse = await apiClient.getCourse(first.id);
            if (fullCourse && fullCourse.course && fullCourse.holes && fullCourse.holes.length > 0) {
              activeNeonCourseId = fullCourse.course.id;
              document.getElementById("meta-course-name").value = fullCourse.course.name;
              fullCourse.holes.forEach(hr => {
                const hN = hr.hole_number;
                courseHolesStore[hN] = {
                  meta: { holeNumber: hN, par: hr.par || 4, handicap: hr.handicap, greenSlopeDir: 215, greenSlopePct: 2.8, courseName: fullCourse.course.name },
                  lidarGrid: hr.lidar_grid || null,
                  features: Array.isArray(hr.features) && hr.features.length > 0 ? hr.features : []
                };
              });
              map.setView([fullCourse.course.center_lat, fullCourse.course.center_lon], 16);
              refreshHoleDropdownBadges();
              switchToHoleNumber(1);
              showToast("Loaded " + fullCourse.course.name + " from Neon Postgres!");
            }
          }
        }
      }).catch(e => console.warn("Neon boot check:", e));
`;

jsCode = jsCode.replace(
  'const restored = loadStateFromLocalStorage();',
  neonBootCheck + '\n      const restored = loadStateFromLocalStorage();'
);

// 4. Add Fallback Mode: click Tee -> Green 1..18 directly on satellite map
const fallbackTool = `
    // Fallback Mode (Phase 5 requirement): Click Tee -> Green 1..18 on map
    let fallbackMapHoleActive = false;
    let fallbackTeePt = null;

    function initFallbackMapHole() {
      const parent = document.getElementById("osm-import-btn")?.parentNode;
      if (parent && !document.getElementById("fallback-map-hole-btn")) {
        const btn = document.createElement("button");
        btn.id = "fallback-map-hole-btn";
        btn.className = "bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium px-2.5 py-2 rounded-lg flex items-center gap-1 shadow-sm transition shrink-0";
        btn.title = "Click-to-assign Hole: Click [1] Tee then [2] Green on the satellite map";
        btn.innerHTML = '<i data-lucide="crosshair" class="w-3.5 h-3.5"></i><span class="hidden md:inline">Map Hole</span>';
        btn.addEventListener("click", () => {
          fallbackMapHoleActive = true;
          fallbackTeePt = null;
          setTool("select");
          setStatus("Click [1] TEE on the satellite map, then [2] GREEN.");
          showToast("Click Tee location on the map");
        });
        parent.insertBefore(btn, document.getElementById("osm-import-btn"));
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }

    map.on("click", (e) => {
      if (fallbackMapHoleActive) {
        const pt = [e.latlng.lng, e.latlng.lat];
        if (!fallbackTeePt) {
          fallbackTeePt = pt;
          setStatus("Tee placed! Now click the GREEN center on the map.");
          showToast("Tee placed! Now click Green center");
          return;
        } else {
          const greenPt = pt;
          const teePt = fallbackTeePt;
          fallbackMapHoleActive = false;
          fallbackTeePt = null;

          const curH = parseInt(document.getElementById("meta-hole-num").value, 10) || 1;
          const distYds = Math.round(turf.distance(turf.point(teePt), turf.point(greenPt), { units: 'meters' }) * M_TO_YARD);
          const brg = Math.round((turf.bearing(turf.point(teePt), turf.point(greenPt)) + 360) % 360);

          holeData.features = [
            { id: "tee-" + Date.now(), type: "tee", coords: teePt, props: { label: "Tee", elev: 0 } },
            { id: "cl-" + Date.now(), type: "centerline", coords: [teePt, greenPt], props: {} }
          ];

          // Check if green polygon exists in cached OSM near greenPt
          if (cachedCourseOSM && cachedCourseOSM.greens) {
            let bestGreen = null, minDist = Infinity;
            cachedCourseOSM.greens.forEach(g => {
              const d = turf.distance(turf.point(greenPt), turf.point(g.center), { units: 'meters' });
              if (d < minDist && d < 65) { minDist = d; bestGreen = g; }
            });
            if (bestGreen) {
              holeData.features.push({ id: bestGreen.id, type: "green", coords: bestGreen.coords, props: {} });
            }
          }

          syncMapFromState(true);
          saveStateToLocalStorage();
          showToast("Hole " + curH + " mapped (" + distYds + " yds, " + brg + "°)! Saved.");
          return;
        }
      }
    });
`;

jsCode = jsCode.replace(
  'lucide.createIcons();',
  'lucide.createIcons();\n      initFallbackMapHole();'
);

jsCode = jsCode + '\n' + fallbackTool;

const fullMainTs = header + jsCode;

fs.writeFileSync('src/main.ts', fullMainTs, 'utf8');
console.log('Successfully created src/main.ts. Total characters:', fullMainTs.length);
