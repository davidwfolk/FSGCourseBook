// @ts-nocheck
import { apiClient } from './api-client';

declare const L: any;
declare const turf: any;
declare const lucide: any;

let activeNeonCourseId: string | null = null;
let saveToNeonTimer: any = null;

    /********************************************************************
     * 1. CONSTANTS, GEOMETRY HELPERS & CHAMPIONSHIP PRESETS
     ********************************************************************/
    const YARD_TO_M = 0.9144;
    const M_TO_YARD = 1.0936133;
    const STORAGE_KEY = "tourbook_gis_v3_project_state";

    function localYardsToLngLat(originLngLat, xYards, yYards, bearingDeg = 0) {
      const distYards = Math.hypot(xYards, yYards);
      if (distYards < 0.001) return [...originLngLat];
      const angleDeg = (Math.atan2(xYards, yYards) * 180) / Math.PI + bearingDeg;
      const pt = turf.destination(turf.point(originLngLat), distYards * YARD_TO_M, angleDeg, { units: 'meters' });
      return pt.geometry.coordinates;
    }

    // Chaikin corner-cutting polygon smoothing from FSG-Greens-Book/src/plotter.py
    function smoothPolygonCoords(ringCoords, refinements = 2) {
      if (!ringCoords || ringCoords.length < 4) return ringCoords;
      let pts = ringCoords.slice(0, -1);
      for (let r = 0; r < refinements; r++) {
        const nextPts = [];
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

    function buildPreset1Hole() {
      const teeOrigin = [-121.94855, 36.56885];
      const bearing = 332;
      const pt = (x, y) => localYardsToLngLat(teeOrigin, x, y, bearing);
      const poly = (pts) => {
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
          // Note dogleg pivot at (-3, 275) -> approach into green at (-6, 420) so Approach Bearing differs slightly from Tee Bearing!
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
          // Intentional Fairway Slope Ridges (Matching Photo 1 tiers at 315y and 380y carry)
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

    function buildPreset2Hole() {
      const teeOrigin = [-121.9512, 36.5715];
      const bearing = 38;
      const pt = (x, y) => localYardsToLngLat(teeOrigin, x, y, bearing);
      const poly = (pts) => {
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
     * 2. APPLICATION STATE, 18-HOLE STORAGE & LEAFLET INITIALIZATION
     ********************************************************************/
    let holeData = buildPreset1Hole();
    let courseHolesStore = {};

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
 // Maps holeNum (1..18) -> { meta, features, lidarGrid }
    let cachedCourseOSM = null; // Full 18-hole OSM raw cache for the active course

    let activeTool = "select";
    let selectedFeatureId = null;
    let drawingPoints = [];
    let tempDrawingLayer = null;

    let viewMode = "full"; // 'full' | 'split' | 'green' | 'usga'
    let showCorridorCutout = true;
    let showLadders = true;
    let showHachures = true;

    const map = L.map("map", {
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

    function showToast(msg) {
      const toast = document.getElementById("toast");
      document.getElementById("toast-text").textContent = msg;
      toast.classList.remove("opacity-0");
      toast.classList.add("opacity-100");
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(() => {
        toast.classList.remove("opacity-100");
        toast.classList.add("opacity-0");
      }, 2800);
    }

    function setStatus(msg) {
      document.getElementById("status-message").innerHTML = `
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>${msg}</span>
      `;
    }

    // Auto-Save Current Hole & 18-Hole Course Project to localStorage
    
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

    function saveStateToLocalStorage() {
      syncHoleToNeon();
      try {
        const curHoleNum = parseInt(document.getElementById("meta-hole-num").value, 10) || 1;
        holeData.meta = {
          holeNumber: curHoleNum,
          par: parseInt(document.getElementById("meta-hole-par").value, 10) || 4,
          greenSlopeDir: parseFloat(document.getElementById("meta-green-slope-dir").value) || 215,
          greenSlopePct: parseFloat(document.getElementById("meta-green-slope-pct").value) || 2.8,
          courseName: document.getElementById("meta-course-name").value || "Lakeview"
        };
        courseHolesStore[curHoleNum] = JSON.parse(JSON.stringify(holeData));

        const payload = {
          version: 3,
          activeHoleNum: curHoleNum,
          courseName: holeData.meta.courseName,
          mapCenter: [map.getCenter().lat, map.getCenter().lng],
          mapZoom: map.getZoom(),
          greenZoom: parseFloat(document.getElementById("meta-green-zoom").value) || 2.3,
          corridorYds: parseFloat(document.getElementById("meta-corridor-yds").value) || 20,
          courseHolesStore,
          cachedCourseOSM
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn("Auto-save storage warning:", e);
      }
    }

    function loadStateFromLocalStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.courseHolesStore) return false;

        courseHolesStore = parsed.courseHolesStore;
        cachedCourseOSM = parsed.cachedCourseOSM || null;
        const activeNum = parsed.activeHoleNum || 1;

        if (parsed.courseName) document.getElementById("meta-course-name").value = parsed.courseName;
        if (parsed.greenZoom) document.getElementById("meta-green-zoom").value = parsed.greenZoom;
        if (parsed.corridorYds) document.getElementById("meta-corridor-yds").value = parsed.corridorYds;

        if (courseHolesStore[activeNum]) {
          holeData = courseHolesStore[activeNum];
          document.getElementById("meta-hole-num").value = activeNum;
          document.getElementById("course-hole-select").value = String(activeNum);
          document.getElementById("meta-hole-par").value = holeData.meta?.par || 4;
          document.getElementById("meta-green-slope-dir").value = holeData.meta?.greenSlopeDir || 215;
          document.getElementById("meta-green-slope-pct").value = holeData.meta?.greenSlopePct || 2.8;
        }
        if (parsed.mapCenter && parsed.mapCenter.length === 2) {
          map.setView(parsed.mapCenter, parsed.mapZoom || 17);
        }
        refreshHoleDropdownBadges();
        return true;
      } catch (e) {
        console.warn("Could not restore state:", e);
        return false;
      }
    }

    function refreshHoleDropdownBadges() {
      const sel = document.getElementById("course-hole-select");
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

    function purgeDistantFeaturesIfNeeded(newCoord) {
      const existingTee = holeData.features.find((f) => f.type === "tee");
      if (existingTee) {
        const distMeters = turf.distance(turf.point(existingTee.coords), turf.point(newCoord), { units: "meters" });
        if (distMeters > 2500) {
          holeData.features = [];
          holeData.lidarGrid = null;
          document.getElementById("preset-select").value = "empty";
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
        fwFeat.coords.forEach((c) => {
          const d = turf.distance(turf.point(gCenter), turf.point(c), { units: "meters" });
          if (d > maxD) {
            maxD = d;
            farPt = c;
          }
        });
        const brg = turf.bearing(turf.point(gCenter), turf.point(farPt));
        const teePt = turf.destination(turf.point(farPt), 35 * YARD_TO_M, brg, { units: "meters" }).geometry.coordinates;
        holeData.features.unshift({ id: "tee-auto", type: "tee", coords: teePt, props: { label: "Back Tee", elev: 0 } });
      } else if (fwFeat) {
        const fwCenter = turf.centroid(turf.polygon([fwFeat.coords])).geometry.coordinates;
        let maxD = -1;
        let endA = fwFeat.coords[0];
        fwFeat.coords.forEach((c) => {
          const d = turf.distance(turf.point(fwCenter), turf.point(c), { units: "meters" });
          if (d > maxD) {
            maxD = d;
            endA = c;
          }
        });
        holeData.features.unshift({ id: "tee-auto", type: "tee", coords: [...endA], props: { label: "Tee", elev: 0 } });
      } else if (greenFeat) {
        const gCenter = turf.centroid(turf.polygon([greenFeat.coords])).geometry.coordinates;
        const teePt = turf.destination(turf.point(gCenter), 360 * YARD_TO_M, 180, { units: "meters" }).geometry.coordinates;
        holeData.features.unshift({ id: "tee-auto", type: "tee", coords: teePt, props: { label: "Tee", elev: 0 } });
      }
    }

    /********************************************************************
     * 3. LEAFLET MAP RENDERING & INTERACTIVE VERTEX DRAGGING
     ********************************************************************/
    function syncMapFromState(fitBounds = false) {
      featureLayerGroup.clearLayers();
      handleLayerGroup.clearLayers();

      const allLatLngs = [];

      holeData.features.forEach((feat) => {
        const isSelected = feat.id === selectedFeatureId;

        if (feat.type === "tee" || feat.type === "tree" || feat.type === "target") {
          const latlng = [feat.coords[1], feat.coords[0]];
          allLatLngs.push(latlng);

          let color = "#f43f5e";
          let radius = 7;
          if (feat.type === "tree") {
            color = "#10b981";
            radius = 9;
          } else if (feat.type === "target") {
            color = feat.props.subtype === "cross_gold" ? "#f59e0b" : feat.props.subtype === "edge_ring" ? "#38bdf8" : "#ef4444";
            radius = 6;
          }

          const marker = L.circleMarker(latlng, {
            radius: isSelected ? radius + 3 : radius,
            color: isSelected ? "#ffffff" : "#0f172a",
            weight: isSelected ? 3 : 2,
            fillColor: color,
            fillOpacity: 0.95
          }).addTo(featureLayerGroup);

          marker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            selectFeature(feat.id);
          });

          const dragMarker = L.marker(latlng, {
            draggable: true,
            icon: L.divIcon({
              className: "vertex-handle",
              iconSize: [10, 10]
            })
          }).addTo(handleLayerGroup);

          dragMarker.on("drag", (e) => {
            const pos = e.target.getLatLng();
            feat.coords = [pos.lng, pos.lat];
            marker.setLatLng(pos);
            renderYardageBookSVG();
            updateInspectorMetrics();
          });

          dragMarker.on("dragend", () => saveStateToLocalStorage());

          dragMarker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            selectFeature(feat.id);
          });
        } else if (feat.type === "centerline" || feat.type === "ob" || feat.type === "ridge") {
          const latlngs = feat.coords.map((c) => [c[1], c[0]]);
          if (feat.type === "centerline") allLatLngs.push(...latlngs);

          const isOB = feat.type === "ob";
          const isRidge = feat.type === "ridge";
          const line = L.polyline(latlngs, {
            color: isSelected ? "#10b981" : isOB ? "#ffffff" : isRidge ? "#fb923c" : "#fbbf24",
            weight: isSelected ? 4 : isOB ? 3 : 2.5,
            dashArray: isOB ? "8, 5" : isRidge ? "4, 4" : "6, 6"
          }).addTo(featureLayerGroup);

          line.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            selectFeature(feat.id);
          });

          feat.coords.forEach((coord, idx) => {
            const vm = L.marker([coord[1], coord[0]], {
              draggable: true,
              icon: L.divIcon({ className: "vertex-handle", iconSize: [10, 10] })
            }).addTo(handleLayerGroup);

            vm.on("drag", (e) => {
              const pos = e.target.getLatLng();
              feat.coords[idx] = [pos.lng, pos.lat];
              line.setLatLngs(feat.coords.map((c) => [c[1], c[0]]));
              renderYardageBookSVG();
            });
            vm.on("dragend", () => saveStateToLocalStorage());
          });
        } else {
          const ring = feat.coords.slice(0, -1);
          const latlngs = ring.map((c) => [c[1], c[0]]);
          allLatLngs.push(...latlngs);

          const styleMap = {
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

          poly.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            selectFeature(feat.id);
          });

          if (isSelected || feat.type === "green" || feat.type === "bunker" || feat.type === "fairway" || feat.type === "crop") {
            ring.forEach((coord, idx) => {
              const vm = L.marker([coord[1], coord[0]], {
                draggable: true,
                icon: L.divIcon({ className: "vertex-handle", iconSize: [10, 10] })
              }).addTo(handleLayerGroup);

              vm.on("drag", (e) => {
                const pos = e.target.getLatLng();
                feat.coords[idx] = [pos.lng, pos.lat];
                feat.coords[feat.coords.length - 1] = [...feat.coords[0]];
                poly.setLatLngs(feat.coords.slice(0, -1).map((c) => [c[1], c[0]]));
                renderYardageBookSVG();
              });
              vm.on("dragend", () => saveStateToLocalStorage());
            });
          }
        }
      });

      if (fitBounds && allLatLngs.length > 1) {
        map.fitBounds(L.latLngBounds(allLatLngs).pad(0.18));
      }

      document.getElementById("telemetry-lidar").textContent = holeData.lidarGrid ? "USGS 3DEP 1m" : "Synthetic";
      renderYardageBookSVG();
      saveStateToLocalStorage();
      refreshHoleDropdownBadges();
    }

    /********************************************************************
     * 4. INTERACTIVE DRAWING & FEATURE INSPECTOR LOGIC
     ********************************************************************/
    function setTool(toolName) {
      activeTool = toolName;
      drawingPoints = [];
      if (tempDrawingLayer) {
        map.removeLayer(tempDrawingLayer);
        tempDrawingLayer = null;
      }

      document.querySelectorAll(".tool-btn").forEach((btn) => {
        if (btn.dataset.tool === toolName) {
          btn.classList.add("bg-emerald-600", "text-white");
          btn.classList.remove("text-slate-300", "hover:bg-slate-800");
        } else {
          btn.classList.remove("bg-emerald-600", "text-white");
          btn.classList.add("text-slate-300", "hover:bg-slate-800");
        }
      });

      const isPolyOrLine = ["centerline", "ob", "ridge", "green", "fairway", "bunker", "water", "crop"].includes(toolName);
      document.getElementById("finish-shape-btn").classList.toggle("hidden", !isPolyOrLine);
      document.getElementById("map").classList.toggle("map-crosshair", toolName !== "select");

      const toolPrompts = {
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

    map.on("click", (e) => {
      const lngLat = [e.latlng.lng, e.latlng.lat];

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

    function finishActiveShape() {
      if (!["centerline", "ob", "ridge", "green", "fairway", "bunker", "water", "crop"].includes(activeTool)) return;
      const isLine = activeTool === "centerline" || activeTool === "ob" || activeTool === "ridge";
      const minPts = isLine ? 2 : 3;
      if (drawingPoints.length < minPts) {
        showToast(`Add at least ${minPts} points to complete ${activeTool}.`);
        return;
      }

      purgeDistantFeaturesIfNeeded(drawingPoints[0]);

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

    document.getElementById("finish-shape-btn").addEventListener("click", finishActiveShape);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && drawingPoints.length >= 2) {
        finishActiveShape();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedFeatureId && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        deleteSelectedFeature();
      } else if (e.key === "Escape") {
        setTool("select");
      }
    });

    function selectFeature(id) {
      selectedFeatureId = id;
      const inspector = document.getElementById("feature-inspector");
      const delBtn = document.getElementById("delete-selected-btn");
      const feat = holeData.features.find((f) => f.id === id);

      if (!feat) {
        inspector.classList.add("hidden");
        delBtn.disabled = true;
        syncMapFromState();
        return;
      }

      delBtn.disabled = false;
      inspector.classList.remove("hidden");
      document.getElementById("inspector-title").textContent = `${feat.type.toUpperCase()} PROPERTIES`;
      document.getElementById("prop-label").value = feat.props?.label || "";
      document.getElementById("prop-elev").value = feat.props?.elev ?? "";
      document.getElementById("prop-radius").value = feat.props?.radius ?? 8;
      document.getElementById("prop-dx").value = feat.props?.dx ?? 0;
      document.getElementById("prop-dy").value = feat.props?.dy ?? 0;
      document.getElementById("prop-subtype").value = feat.props?.subtype || "cross_red";

      document.getElementById("prop-radius-wrap").classList.toggle("hidden", feat.type !== "tree");
      document.getElementById("prop-marker-type-wrap").classList.toggle("hidden", feat.type !== "target");

      updateInspectorMetrics();
      syncMapFromState();
    }

    function updateInspectorMetrics() {
      const feat = holeData.features.find((f) => f.id === selectedFeatureId);
      if (!feat || !window.__lastSpatialModel) return;
      const { teeCoord, frontGreenCoord } = window.__lastSpatialModel;
      let samplePt = Array.isArray(feat.coords[0]) ? feat.coords[0] : feat.coords;
      const carry = Math.round(turf.distance(turf.point(teeCoord), turf.point(samplePt), { units: "meters" }) * M_TO_YARD);
      const toFront = Math.round(turf.distance(turf.point(frontGreenCoord), turf.point(samplePt), { units: "meters" }) * M_TO_YARD);
      document.getElementById("inspector-metrics").textContent = `Carry: ${carry}y | To Front: ${toFront}y`;
    }

    function deleteSelectedFeature() {
      if (!selectedFeatureId) return;
      holeData.features = holeData.features.filter((f) => f.id !== selectedFeatureId);
      selectedFeatureId = null;
      document.getElementById("feature-inspector").classList.add("hidden");
      document.getElementById("delete-selected-btn").disabled = true;
      syncMapFromState();
      showToast("Feature removed.");
    }

    document.getElementById("delete-selected-btn").addEventListener("click", deleteSelectedFeature);
    document.getElementById("close-inspector-btn").addEventListener("click", () => selectFeature(null));

    function resetHoleToCurrentView() {
      selectedFeatureId = null;
      document.getElementById("feature-inspector").classList.add("hidden");
      document.getElementById("preset-select").value = "empty";
      holeData.features = [];
      holeData.lidarGrid = null;
      syncMapFromState(false);
      setTool("green");
      showToast("Hole cleared! Click 'Pull OSM' or trace Green & Fairway.");
    }

    document.getElementById("clear-hole-btn").addEventListener("click", resetHoleToCurrentView);

    ["prop-label", "prop-elev", "prop-radius", "prop-dx", "prop-dy", "prop-subtype"].forEach((inputId) => {
      document.getElementById(inputId).addEventListener("input", () => {
        const feat = holeData.features.find((f) => f.id === selectedFeatureId);
        if (!feat) return;
        feat.props = feat.props || {};
        feat.props.label = document.getElementById("prop-label").value;
        const elevVal = document.getElementById("prop-elev").value;
        feat.props.elev = elevVal === "" ? 0 : parseInt(elevVal, 10);
        feat.props.radius = parseFloat(document.getElementById("prop-radius").value) || 8;
        feat.props.dx = parseFloat(document.getElementById("prop-dx").value) || 0;
        feat.props.dy = parseFloat(document.getElementById("prop-dy").value) || 0;
        feat.props.subtype = document.getElementById("prop-subtype").value;
        syncMapFromState();
      });
    });

    // Auto-Populate 25-Yard Fairway Layup / Approach Dots along Centerline
    function autoPopulateFairwayDots(force = false) {
      const model = computeSpatialHoleModel();
      const fwFeat = holeData.features.find((f) => f.type === "fairway");
      const clFeat = holeData.features.find((f) => f.type === "centerline");

      if (!force && holeData.features.some((f) => f.type === "target")) {
        return 0; // Already has fairway targets
      }

      // Remove previous auto-generated targets so we don't duplicate
      holeData.features = holeData.features.filter((f) => !String(f.id).startsWith("auto-targ-"));

      const distancesToFront = [40, 60, 80, 105, 130, 155, 180, 205];
      let added = 0;

      const clCoords = clFeat && clFeat.coords && clFeat.coords.length >= 2
        ? clFeat.coords
        : [model.teeCoord, model.frontGreenCoord];
      const clLine = turf.lineString(clCoords);
      const totalLenM = turf.length(clLine, { units: "meters" });
      const totalHoleYds = totalLenM * M_TO_YARD;

      const fwPoly = (fwFeat && fwFeat.coords && fwFeat.coords.length >= 4)
        ? turf.polygon([fwFeat.coords])
        : null;

      distancesToFront.forEach((dFront, idx) => {
        const distFromTeeYds = totalHoleYds - dFront;
        if (distFromTeeYds < 120) return; // Don't drop markers back on the tee box

        const distFromTeeM = distFromTeeYds * YARD_TO_M;
        if (distFromTeeM <= 10 || distFromTeeM >= totalLenM - 8) return;

        // Sample point strictly along actual centerline path!
        const sampledPt = turf.along(clLine, distFromTeeM, { units: "meters" });
        let finalCoord = sampledPt.geometry.coordinates;

        // Small alternating lateral offset (±2.5 yards) to create realistic scatter matching Photos 1 & 2
        try {
          const latSign = (idx % 2 === 0 ? 1 : -1);
          const nextPt = turf.along(clLine, Math.min(totalLenM, distFromTeeM + 4), { units: "meters" });
          const localBearing = turf.bearing(sampledPt, nextPt);
          const offsetBearing = (localBearing + latSign * 90 + 360) % 360;
          const candidateOffset = turf.destination(sampledPt, 2.5 * YARD_TO_M, offsetBearing, { units: "meters" });

          // If fairway polygon exists, ensure offset point stays inside fairway; otherwise stick to centerline
          if (fwPoly) {
            if (turf.booleanPointInPolygon(candidateOffset, fwPoly)) {
              finalCoord = candidateOffset.geometry.coordinates;
            }
          } else {
            finalCoord = candidateOffset.geometry.coordinates;
          }
        } catch {}

        const subtype = dFront === 105 ? "cross_red" : (dFront === 130 || dFront === 180) ? "cross_gold" : "sprinkler";
        holeData.features.push({
          id: `auto-targ-${dFront}`,
          type: "target",
          coords: finalCoord,
          props: { subtype, elev: 0, label: "", dx: 0, dy: 0 }
        });
        added++;
      });

      syncMapFromState(false);
      return added;
    }

    document.getElementById("auto-targets-btn").addEventListener("click", () => {
      const added = autoPopulateFairwayDots(true);
      showToast(`Auto-placed ${added} fairway yardage markers! Drag any dot on the map or SVG book to adjust.`);
    });

    /********************************************************************
     * 5. COURSE SEARCH, 18-HOLE OSM CACHE & PERSISTENT HOLE SWITCHING
     ********************************************************************/
    const searchInput = document.getElementById("course-search-input");
    const searchBtn = document.getElementById("course-search-btn");
    const resultsDropdown = document.getElementById("course-search-results");
    const courseHoleSelect = document.getElementById("course-hole-select");

    searchBtn.addEventListener("click", runCourseSearch);
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runCourseSearch();
      if (e.key === "Escape") resultsDropdown.classList.add("hidden");
    });

    document.addEventListener("click", (e) => {
      const wrapper = document.getElementById("course-search-wrapper");
      if (wrapper && !wrapper.contains(e.target)) {
        resultsDropdown.classList.add("hidden");
      }
    });

    async function fetchOverpassWithFallback(query) {
      // 1. Try backend serverless proxy first (with proper User-Agent to bypass 406/429/CORS)
      try {
        const proxyRes = await fetch('/api/overpass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        if (proxyRes.ok) {
          const json = await proxyRes.json();
          if (json && json.elements) return json;
        }
      } catch (e) {
        console.warn("/api/overpass proxy error, trying direct mirrors:", e);
      }

      // 2. Direct browser fallback
      const mirrors = [
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
        `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
        `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`,
        `https://maps.mail.ru/osm/tools/overpass/api/interpreter?data=${encodeURIComponent(query)}`
      ];
      for (const url of mirrors) {
        try {
          const res = await fetch(url, { method: "GET", mode: "cors" });
          if (res.ok) {
            const json = await res.json();
            if (json && json.elements) return json;
          }
        } catch (err) {
          console.warn("Mirror failed, trying next:", url.split("/")[2]);
        }
      }
      return null;
    }

    async function runCourseSearch() {
      const rawQuery = searchInput.value.trim();
      if (!rawQuery) return;

      resultsDropdown.classList.remove("hidden");
      resultsDropdown.innerHTML = `
        <div class="px-3.5 py-3 text-xs text-slate-400 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>Searching golf courses matching "${rawQuery}"...</span>
        </div>
      `;

      try {
        // Query /api/search (checks Neon DB + Nominatim + Zip with server-side User-Agent to prevent 403 Forbidden)
        let courses = [];
        try {
          const apiRes = await fetch(`/api/search?q=${encodeURIComponent(rawQuery)}`);
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            if (apiData && apiData.courses && apiData.courses.length > 0) {
              courses = apiData.courses;
            }
          }
        } catch (e) {
          console.warn("Search API notice:", e);
        }

        // Direct browser fallback if API returned no results
        if (courses.length === 0) {
          const isZipCode = /^\d{5}(-\d{4})?$/.test(rawQuery);
          courses = isZipCode
            ? await searchCoursesByZip(rawQuery.slice(0, 5))
            : await searchCoursesByName(rawQuery);
        }

        renderCourseDropdown(courses, rawQuery);
      } catch (err) {
        resultsDropdown.innerHTML = `
          <div class="px-3.5 py-3 text-xs text-rose-400">
            Search failed or timed out. Check connection and try again.
          </div>
        `;
      }
    }

    async function searchCoursesByZip(zip) {
      let centerLat = null, centerLon = null, zipCity = "", zipState = "";
      try {
        const zpRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
        if (zpRes.ok) {
          const zpData = await zpRes.json();
          if (zpData.places && zpData.places.length > 0) {
            centerLat = parseFloat(zpData.places[0].latitude);
            centerLon = parseFloat(zpData.places[0].longitude);
            zipCity = zpData.places[0]["place name"] || "";
            zipState = zpData.places[0]["state abbreviation"] || "";
          }
        }
      } catch (e) { }

      if (centerLat === null) {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&postalcode=${encodeURIComponent(zip)}&countrycodes=us&addressdetails=1&limit=1`
        );
        const nomData = await nomRes.json();
        if (!nomData || nomData.length === 0) return [];
        centerLat = parseFloat(nomData[0].lat);
        centerLon = parseFloat(nomData[0].lon);
        zipCity = nomData[0].address?.city || nomData[0].address?.town || nomData[0].address?.county || "";
        zipState = nomData[0].address?.state || "";
      }

      const radiusMeters = 25000;
      const overpassQuery = `[out:json][timeout:25];(way["leisure"="golf_course"](around:${radiusMeters},${centerLat},${centerLon});relation["leisure"="golf_course"](around:${radiusMeters},${centerLat},${centerLon});way["golf"="course"](around:${radiusMeters},${centerLat},${centerLon}););out center tags;`;

      const osmData = await fetchOverpassWithFallback(overpassQuery);
      if (!osmData || !osmData.elements) return [];

      const seenNames = new Set();
      const results = [];

      osmData.elements.forEach((el) => {
        const name = el.tags?.name || "Golf Course (Unnamed in OSM)";
        const lat = el.center?.lat || el.lat;
        const lon = el.center?.lon || el.lon;
        if (!lat || !lon) return;

        const key = `${name.toLowerCase()}-${lat.toFixed(2)}`;
        if (seenNames.has(key)) return;
        seenNames.add(key);

        const distMiles = turf.distance(turf.point([centerLon, centerLat]), turf.point([lon, lat]), { units: "miles" }).toFixed(1);
        const city = el.tags?.["addr:city"] || zipCity;
        const state = el.tags?.["addr:state"] || zipState;
        const postcode = el.tags?.["addr:postcode"] || zip;

        results.push({
          name, city, state, postcode, lat, lon,
          distMiles: parseFloat(distMiles),
          badge: `${distMiles} mi from ${zip}`
        });
      });

      results.sort((a, b) => a.distMiles - b.distMiles);
      return results;
    }

    async function searchCoursesByName(query) {
      const golfQuery = /golf|country club|links|cc|gc/i.test(query) ? query : `${query} golf`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(golfQuery)}&addressdetails=1&extratags=1&limit=12`;
      const res = await fetch(url);
      let data = await res.json();

      if (!data || data.length === 0) {
        const rawUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&extratags=1&limit=12`;
        const rawRes = await fetch(rawUrl);
        data = await rawRes.json();
      }
      if (!data || data.length === 0) return [];

      return data.map((item) => {
        const addr = item.address || {};
        const name = item.name || addr.golf_course || addr.leisure || item.display_name.split(",")[0];
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
        const state = addr.state || addr.region || "";
        const postcode = addr.postcode || "";
        const isGolf = item.type === "golf_course" || item.class === "leisure" || /golf|club|links/i.test(name);
        return {
          name, city, state, postcode,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          badge: isGolf ? "Golf Course" : item.type || "Location"
        };
      });
    }

    function renderCourseDropdown(courses, query) {
      if (!courses || courses.length === 0) {
        resultsDropdown.innerHTML = `<div class="px-3.5 py-3 text-xs text-slate-400">No golf courses found for "<strong>${query}</strong>".</div>`;
        return;
      }

      resultsDropdown.innerHTML = courses
        .map((c, idx) => {
          const locationParts = [c.city, c.state].filter(Boolean).join(", ");
          const zipDisplay = c.postcode ? `<span class="text-slate-400 font-mono-code">${c.postcode}</span>` : "";
          const badgeClass = c.isNeon
            ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/40 font-bold"
            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
          return `
            <button type="button" data-idx="${idx}" class="course-result-item w-full text-left px-3.5 py-2.5 hover:bg-slate-800/90 transition flex items-center justify-between gap-3 group">
              <div class="min-w-0">
                <div class="text-xs font-semibold text-white group-hover:text-emerald-400 truncate">${c.name}</div>
                <div class="text-[11px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                  <span>${locationParts || "Coords: " + c.lat.toFixed(4) + ", " + c.lon.toFixed(4)}</span>
                  ${zipDisplay ? `<span>•</span>${zipDisplay}` : ""}
                </div>
              </div>
              <span class="shrink-0 text-[10px] font-mono-code px-2 py-0.5 rounded border ${badgeClass}">${c.badge}</span>
            </button>
          `;
        })
        .join("");

      resultsDropdown.querySelectorAll(".course-result-item").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const chosen = courses[parseInt(btn.dataset.idx, 10)];
          if (!chosen) return;

          searchInput.value = `${chosen.name}${chosen.city ? " — " + chosen.city : ""}`;
          const cleanCourseName = chosen.name.replace(/Golf Course|Golf Club|Country Club|GC|CC/gi, "").trim() || chosen.name;
          document.getElementById("meta-course-name").value = cleanCourseName;
          resultsDropdown.classList.add("hidden");

          selectedFeatureId = null;
          document.getElementById("feature-inspector").classList.add("hidden");
          document.getElementById("preset-select").value = "empty";

          // Clear previous hole features to avoid fitBounds snapping back to preset!
          holeData.features = [];
          holeData.lidarGrid = null;
          courseHolesStore = {};

          // Move the map immediately to the selected course coordinates!
          map.setView([chosen.lat, chosen.lon], 16);
          setTimeout(() => { map.invalidateSize(); }, 200);

          if (chosen.isNeon && chosen.neonId) {
            // Load from Neon Postgres
            await loadCourseFromNeon(chosen.neonId);
          } else {
            // Load and cache from Overpass
            await cacheAll18HolesFromOverpass(chosen.lat, chosen.lon, cleanCourseName);
          }
        });
      });
    }

    // Load Course and all 18 Holes from Neon Postgres
    async function loadCourseFromNeon(courseId: string) {
      setStatus(`Loading course and all 18 holes from Neon Postgres...`);
      showToast(`Loading course from Neon database...`);
      const data = await apiClient.getCourse(courseId);
      if (!data || !data.course) {
        showToast("Could not load course from Neon database.");
        return;
      }
      const c = data.course;
      activeNeonCourseId = c.id;
      const cleanCourseName = c.name.replace(/Golf Course|Golf Club|Country Club|GC|CC/gi, "").trim() || c.name;
      document.getElementById("meta-course-name").value = cleanCourseName;

      courseHolesStore = {};
      if (data.holes && data.holes.length > 0) {
        data.holes.forEach((h: any) => {
          const hNum = h.hole_number;
          let features: any[] = [];
          if (h.features && Array.isArray(h.features) && h.features.length > 0) {
            features = h.features;
          } else {
            // Reconstruct features if saved in separate geojson columns
            if (h.tee_lat && h.tee_lon) {
              features.push({
                id: `tee-${hNum}`,
                type: "tee",
                coords: [parseFloat(h.tee_lon), parseFloat(h.tee_lat)],
                props: { label: "Back Tee", elev: 0 }
              });
            }
            if (h.centerline && Array.isArray(h.centerline) && h.centerline.length >= 2) {
              features.push({
                id: `cl-${hNum}`,
                type: "centerline",
                coords: h.centerline,
                props: {}
              });
            }
            if (h.green_polygon) {
              const gCoords = h.green_polygon.coordinates ? h.green_polygon.coordinates[0] : (Array.isArray(h.green_polygon) ? h.green_polygon : null);
              if (gCoords) {
                features.push({
                  id: `green-${hNum}`,
                  type: "green",
                  coords: gCoords,
                  props: {}
                });
              }
            }
            if (Array.isArray(h.fairways_geojson)) {
              h.fairways_geojson.forEach((fw: any, idx: number) => {
                const fwCoords = fw.geometry?.coordinates?.[0] || fw.coordinates?.[0] || (Array.isArray(fw) ? fw : null);
                if (fwCoords) {
                  features.push({ id: `fw-${hNum}-${idx}`, type: "fairway", coords: fwCoords, props: {} });
                }
              });
            }
            if (Array.isArray(h.bunkers_geojson)) {
              h.bunkers_geojson.forEach((bk: any, idx: number) => {
                const bkCoords = bk.geometry?.coordinates?.[0] || bk.coordinates?.[0] || (Array.isArray(bk) ? bk : null);
                if (bkCoords) {
                  features.push({ id: `bunk-${hNum}-${idx}`, type: "bunker", coords: bkCoords, props: {} });
                }
              });
            }
          }

          courseHolesStore[hNum] = {
            meta: {
              holeNumber: hNum,
              par: h.par || 4,
              greenSlopeDir: 215,
              greenSlopePct: 2.8,
              courseName: cleanCourseName
            },
            lidarGrid: h.lidar_grid || null,
            features
          };
        });

        refreshHoleDropdownBadges();
        switchToHoleNumber(1, true);
        if (c.center_lat && c.center_lon) {
          map.setView([parseFloat(c.center_lat), parseFloat(c.center_lon)], 16);
        }
        showToast(`Loaded ${data.holes.length} holes from Neon database!`);
      } else {
        // Fallback to Overpass if Neon course has no holes yet
        await cacheAll18HolesFromOverpass(parseFloat(c.center_lat), parseFloat(c.center_lon), cleanCourseName);
      }
    }

    // Downloads & caches all 18 holes of a course in ONE Overpass call and pre-populates courseHolesStore[1..18]
    async function cacheAll18HolesFromOverpass(lat, lon, courseName) {
      setStatus(`Downloading & caching full 18-hole OSM data for ${courseName}...`);
      showToast(`Caching all holes for ${courseName}...`);

      const queryWithTrees = `[out:json][timeout:25];(
        way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee"](around:2000,${lat},${lon});
        relation["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard"](around:2000,${lat},${lon});
        way["natural"="water"](around:2000,${lat},${lon});
        relation["natural"="water"](around:2000,${lat},${lon});
        way["water"](around:2000,${lat},${lon});
        node["natural"="tree"](around:1200,${lat},${lon});
      );out geom;`;

      let osm = await fetchOverpassWithFallback(queryWithTrees);
      if (!osm || !osm.elements || osm.elements.length === 0) {
        // Fallback query without tree nodes in case Overpass timed out
        const queryBasic = `[out:json][timeout:25];(
          way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee"](around:2000,${lat},${lon});
          relation["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard"](around:2000,${lat},${lon});
          way["natural"="water"](around:2000,${lat},${lon});
          relation["natural"="water"](around:2000,${lat},${lon});
          way["water"](around:2000,${lat},${lon});
        );out geom;`;
        osm = await fetchOverpassWithFallback(queryBasic);
      }

      if (!osm || !osm.elements) {
        showToast("Overpass busy — zoom to a hole and click 'Pull OSM' or trace manually.");
        map.setView([lat, lon], 16);
        return;
      }

      const parsed = parseOverpassElements(osm.elements);
      cachedCourseOSM = parsed;
      courseHolesStore = {};

      // If OSM has explicit golf=hole ways, build all 18 holes into courseHolesStore automatically!
      if (parsed.holes.length > 0) {
        parsed.holes.forEach((holeWay, idx) => {
          const hNum = parseInt(holeWay.ref, 10) || idx + 1;
          const hPar = parseInt(holeWay.par, 10) || 4;
          const builtFeatures = buildIsolatedHoleFeatures(holeWay.coords, parsed);
          courseHolesStore[hNum] = {
            meta: { holeNumber: hNum, par: hPar, greenSlopeDir: 215, greenSlopePct: 2.8, courseName },
            lidarGrid: null,
            features: builtFeatures
          };
        });
        refreshHoleDropdownBadges();
        const firstHole = parseInt(parsed.holes[0].ref, 10) || 1;
        switchToHoleNumber(firstHole, true);
        showToast(`Cached ${parsed.holes.length} holes for ${courseName}! Use the Hole 1–18 dropdown.`);
      } else if (parsed.greens.length > 0) {
        // Fallback when course only has unnumbered greens/fairways in OSM: assign each green to a hole slot
        parsed.greens.slice(0, 18).forEach((g, idx) => {
          const hNum = idx + 1;
          const teeCoord = turf.destination(turf.point(g.center), 355 * YARD_TO_M, 180, { units: "meters" }).geometry.coordinates;
          const builtFeatures = buildIsolatedHoleFeatures([teeCoord, g.center], parsed, g);
          courseHolesStore[hNum] = {
            meta: { holeNumber: hNum, par: 4, greenSlopeDir: 215, greenSlopePct: 2.8, courseName },
            lidarGrid: null,
            features: builtFeatures
          };
        });
        refreshHoleDropdownBadges();
        switchToHoleNumber(1, true);
        showToast(`Cached ${parsed.greens.length} greens for ${courseName}! Select Hole 1–18 above.`);
      } else {
        holeData = {
          meta: { holeNumber: 1, par: 4, greenSlopeDir: 215, greenSlopePct: 2.8, courseName },
          lidarGrid: null,
          features: []
        };
        syncMapFromState(false);
        map.setView([lat, lon], 16);
        showToast(`No OSM vectors mapped at ${courseName} yet — trace directly on the satellite map!`);
      }

      // Sync full course and 18 holes to Neon Postgres in background
      try {
        apiClient.saveCourseWithOsm({
          name: courseName,
          center_lat: lat,
          center_lon: lon,
          osmData: osm
        }).then(res => {
          if (res && res.course) {
            activeNeonCourseId = res.course.id;
            console.log("Persisted course to Neon Postgres:", res.course.id);
          }
        }).catch(err => console.warn("Neon background save notice:", err));
      } catch (e) { }
    }

    function buildIsolatedHoleFeatures(centerlineCoords, parsedOSM, forcedGreen = null) {
      const chosenTeeCoord = centerlineCoords[0];
      let activeGreenCenter = centerlineCoords[centerlineCoords.length - 1];
      const newFeatures = [];

      let primaryGreen = forcedGreen;
      if (!primaryGreen && parsedOSM.greens.length > 0) {
        const sortedGreens = [...parsedOSM.greens].sort(
          (a, b) =>
            turf.distance(turf.point(activeGreenCenter), turf.point(a.center)) -
            turf.distance(turf.point(activeGreenCenter), turf.point(b.center))
        );
        if (turf.distance(turf.point(activeGreenCenter), turf.point(sortedGreens[0].center), { units: "meters" }) < 95) {
          primaryGreen = sortedGreens[0];
        }
      }

      if (primaryGreen) {
        activeGreenCenter = primaryGreen.center;
        newFeatures.push({
          id: primaryGreen.id,
          type: "green",
          coords: primaryGreen.coords,
          props: { ...(primaryGreen.props || {}) }
        });
      }

      newFeatures.push({
        id: `osm-tee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "tee",
        coords: chosenTeeCoord,
        props: { label: "Back Tee", elev: 0 }
      });

      newFeatures.push({
        id: `osm-cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "centerline",
        coords: centerlineCoords,
        props: {}
      });

      const holeSpineLine = turf.lineString(centerlineCoords);
      const greenPt = turf.point(activeGreenCenter);

      // Geometry/polygon-based feature association using minimum boundary distance
      parsedOSM.features.forEach((feat) => {
        let minEdgeDistM = Infinity;
        let minGreenDistM = Infinity;

        if (Array.isArray(feat.coords[0])) {
          for (let i = 0; i < feat.coords.length; i++) {
            const p = turf.point(feat.coords[i]);
            const d = turf.pointToLineDistance(p, holeSpineLine, { units: "meters" });
            if (d < minEdgeDistM) minEdgeDistM = d;
            const dg = turf.distance(p, greenPt, { units: "meters" });
            if (dg < minGreenDistM) minGreenDistM = dg;
          }
        } else {
          const p = turf.point(feat.coords);
          minEdgeDistM = turf.pointToLineDistance(p, holeSpineLine, { units: "meters" });
          minGreenDistM = turf.distance(p, greenPt, { units: "meters" });
        }

        const minEdgeDistYds = minEdgeDistM * M_TO_YARD;
        const minGreenDistYds = minGreenDistM * M_TO_YARD;

        let isMatch = false;
        if (feat.type === "water") {
          // Water matches if its shoreline is within 70y of the hole centerline or 55y of green
          isMatch = (minEdgeDistYds <= 70) || (minGreenDistYds <= 55);
        } else if (feat.type === "fairway") {
          // Fairway matches if within 35y of hole centerline
          isMatch = (minEdgeDistYds <= 35);
        } else if (feat.type === "bunker") {
          // Bunkers match if within 50y of centerline OR within 45y of green
          isMatch = (minEdgeDistYds <= 50) || (minGreenDistYds <= 45);
        } else if (feat.type === "tree") {
          // Trees match if within 40y of centerline OR within 35y of green
          isMatch = (minEdgeDistYds <= 40) || (minGreenDistYds <= 35);
        }

        if (isMatch) {
          newFeatures.push({
            id: feat.id,
            type: feat.type,
            coords: feat.coords,
            props: { ...(feat.props || {}) }
          });
        }
      });

      return newFeatures;
    }

    function parseOverpassElements(elements) {
      const nodes = {};
      elements.forEach((el) => {
        if (el.type === "node") nodes[el.id] = [el.lon, el.lat];
      });

      const candidateHoles = [];
      const candidateGreens = [];
      const candidateTees = [];
      const candidateFeatures = [];

      elements.forEach((el) => {
        if ((el.type === "way" || el.type === "relation") && el.tags) {
          let rawCoords = [];
          if (el.geometry) {
            rawCoords = el.geometry.map((pt) => [pt.lon, pt.lat]);
          } else if (el.members && Array.isArray(el.members)) {
            const outerMember = el.members.find((m) => m.role === "outer" && m.geometry);
            if (outerMember && outerMember.geometry) {
              rawCoords = outerMember.geometry.map((pt) => [pt.lon, pt.lat]);
            }
          } else if (el.nodes) {
            rawCoords = (el.nodes || []).map((nid) => nodes[nid]).filter(Boolean);
          }

          if (rawCoords.length < 2) return;

          const gType = (el.tags.golf || "").toLowerCase();
          const nType = (el.tags.natural || "").toLowerCase();
          const wType = (el.tags.water || "").toLowerCase();
          const bType = (el.tags.basin || "").toLowerCase();

          if (gType === "hole") {
            candidateHoles.push({
              id: `osm-hole-${el.id}`,
              coords: rawCoords,
              ref: el.tags.ref || el.tags.name || "",
              par: el.tags.par || el.tags["golf:par"] || "4"
            });
            return;
          }

          if (rawCoords.length < 3) return;
          let coords = [...rawCoords];
          if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push([...coords[0]]);
          }
          if (coords.length < 4) return;

          // Only smooth if vertex count is very sparse (< 8) to preserve true OSM shape
          if (coords.length < 8 && (gType === "green" || gType === "bunker")) {
            coords = smoothPolygonCoords(coords, 1);
          }

          const poly = turf.polygon([coords]);
          const center = turf.centroid(poly).geometry.coordinates;

          if (gType === "green") {
            candidateGreens.push({ id: `osm-green-${el.id}`, type: "green", coords, center, props: { label: "" } });
          } else if (gType === "tee") {
            candidateTees.push({ id: `osm-tee-${el.id}`, type: "tee", coords: center, center, props: { label: "OSM Tee", elev: 0 } });
          } else if (gType === "fairway") {
            candidateFeatures.push({ id: `osm-fairway-${el.id}`, type: "fairway", coords, center, props: { label: "" } });
          } else if (gType === "bunker" || nType === "sand") {
            candidateFeatures.push({ id: `osm-bunker-${el.id}`, type: "bunker", coords, center, props: { label: "" } });
          } else if (gType.includes("water") || nType === "water" || Boolean(wType) || Boolean(bType)) {
            candidateFeatures.push({ id: `osm-water-${el.id}`, type: "water", coords, center, props: { label: "" } });
          }
        } else if (el.type === "node" && el.tags && el.tags.natural === "tree") {
          candidateFeatures.push({
            id: `osm-tree-${el.id}`,
            type: "tree",
            coords: [el.lon, el.lat],
            center: [el.lon, el.lat],
            props: { label: "", elev: 0, radius: 8, dx: 0, dy: 0 }
          });
        }
      });

      candidateHoles.sort((a, b) => (parseInt(a.ref, 10) || 99) - (parseInt(b.ref, 10) || 99));
      return { holes: candidateHoles, greens: candidateGreens, tees: candidateTees, features: candidateFeatures };
    }

    // Switch between Holes 1..18 while preserving edits in courseHolesStore
    function switchToHoleNumber(targetHoleNum, skipSave = false) {
      // Save current hole first unless loading freshly
      if (!skipSave) {
        saveStateToLocalStorage();
      }

      const hNum = Math.max(1, Math.min(18, parseInt(targetHoleNum, 10) || 1));
      document.getElementById("meta-hole-num").value = hNum;
      courseHoleSelect.value = String(hNum);

      if (courseHolesStore[hNum] && courseHolesStore[hNum].features && courseHolesStore[hNum].features.length > 0) {
        holeData = JSON.parse(JSON.stringify(courseHolesStore[hNum]));
        document.getElementById("meta-hole-par").value = holeData.meta?.par || 4;
        document.getElementById("meta-green-slope-dir").value = holeData.meta?.greenSlopeDir || 215;
        document.getElementById("meta-green-slope-pct").value = holeData.meta?.greenSlopePct || 2.8;

        // Auto-generate fairway layup dots if not already present
        autoPopulateFairwayDots(false);

        // Auto-generate green contours & slope arrows if not present
        if (!holeData.lidarGrid) {
          const gFeat = holeData.features.find((f) => f.type === "green");
          if (gFeat && gFeat.coords.length >= 4) {
            const model = computeSpatialHoleModel();
            holeData.lidarGrid = generateSyntheticLidarGrid(
              model,
              gFeat,
              parseFloat(document.getElementById("meta-green-slope-pct").value) || 2.8,
              parseFloat(document.getElementById("meta-green-slope-dir").value) || 215
            );
            // Quietly upgrade to live USGS 3DEP LiDAR in background
            triggerLidarFetch(true).catch(() => {});
          }
        }

        syncMapFromState(true);
        showToast(`Switched to Hole ${hNum}`);
      } else {
        // Initialize an empty slot for this hole
        holeData = {
          meta: {
            holeNumber: hNum,
            par: 4,
            greenSlopeDir: 215,
            greenSlopePct: 2.8,
            courseName: document.getElementById("meta-course-name").value || "Lakeview"
          },
          lidarGrid: null,
          features: []
        };
        syncMapFromState(false);
        showToast(`Hole ${hNum} is empty — zoom to Hole ${hNum} on map and click 'Pull OSM' or trace!`);
      }
    }

    courseHoleSelect.addEventListener("change", (e) => {
      switchToHoleNumber(parseInt(e.target.value, 10));
    });

    // Pull OSM Button: If course isn't cached yet, caches entire course around view; otherwise pulls the hole in center of screen into current hole slot
    document.getElementById("osm-import-btn").addEventListener("click", async () => {
      const b = map.getBounds();
      const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
      setStatus("Querying OpenStreetMap Overpass mirrors for golf vectors...");
      showToast("Fetching OSM golf polygons & hole paths...");

      const query = `[out:json][timeout:25];(way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee"](${bbox});node["natural"="tree"](${bbox});way["natural"="water"](${bbox}););out geom;`;
      const osm = await fetchOverpassWithFallback(query);

      if (!osm || !osm.elements) {
        showToast("Overpass API busy. Try zooming in closer.");
        return;
      }

      const parsed = parseOverpassElements(osm.elements);
      const mapCenterPt = turf.point([map.getCenter().lng, map.getCenter().lat]);

      if (parsed.greens.length === 0 && parsed.features.length === 0 && parsed.holes.length === 0) {
        showToast("No OSM golf polygons mapped here yet — use the left toolbar to trace!");
        return;
      }

      // If multiple holes were in view and courseHolesStore is mostly empty, cache all of them into their slots!
      if (parsed.holes.length > 1) {
        cachedCourseOSM = parsed;
        const cName = document.getElementById("meta-course-name").value || "Course";
        parsed.holes.forEach((hw, idx) => {
          const hN = parseInt(hw.ref, 10) || idx + 1;
          if (!courseHolesStore[hN] || !courseHolesStore[hN].features || courseHolesStore[hN].features.length === 0) {
            courseHolesStore[hN] = {
              meta: { holeNumber: hN, par: parseInt(hw.par, 10) || 4, greenSlopeDir: 215, greenSlopePct: 2.8, courseName: cName },
              lidarGrid: null,
              features: buildIsolatedHoleFeatures(hw.coords, parsed)
            };
          }
        });
      }

      // Isolate the single hole closest to the center of the current screen
      const candidateHoles = parsed.holes.map((h) => ({
        ...h,
        distFromScreenCenter: turf.pointToLineDistance(mapCenterPt, turf.lineString(h.coords), { units: "meters" }) * M_TO_YARD
      }));
      const candidateGreens = parsed.greens.map((g) => ({
        ...g,
        distFromScreenCenter: turf.distance(mapCenterPt, turf.point(g.center), { units: "meters" }) * M_TO_YARD
      }));

      candidateHoles.sort((a, b) => a.distFromScreenCenter - b.distFromScreenCenter);
      candidateGreens.sort((a, b) => a.distFromScreenCenter - b.distFromScreenCenter);

      let centerlineCoords = null;
      let forcedGreen = null;

      if (candidateHoles.length > 0 && candidateHoles[0].distFromScreenCenter < 180) {
        const bestHole = candidateHoles[0];
        centerlineCoords = bestHole.coords;
        if (bestHole.ref && !isNaN(parseInt(bestHole.ref, 10))) {
          document.getElementById("meta-hole-num").value = parseInt(bestHole.ref, 10);
          courseHoleSelect.value = String(parseInt(bestHole.ref, 10));
        }
        if (bestHole.par && !isNaN(parseInt(bestHole.par, 10))) {
          document.getElementById("meta-hole-par").value = parseInt(bestHole.par, 10);
        }
      } else if (candidateGreens.length > 0) {
        forcedGreen = candidateGreens[0];
        const activeGreenCenter = forcedGreen.center;
        // Find matching fairway
        let primaryFairway = null, minFwDist = Infinity;
        parsed.features.filter((f) => f.type === "fairway").forEach((fw) => {
          fw.coords.forEach((c) => {
            const d = turf.distance(turf.point(activeGreenCenter), turf.point(c), { units: "meters" }) * M_TO_YARD;
            if (d < minFwDist) { minFwDist = d; primaryFairway = fw; }
          });
        });

        if (primaryFairway && minFwDist < 90) {
          let maxD = -Infinity, farPt = primaryFairway.center;
          primaryFairway.coords.forEach((c) => {
            const d = turf.distance(turf.point(activeGreenCenter), turf.point(c), { units: "meters" }) * M_TO_YARD;
            if (d > maxD) { maxD = d; farPt = c; }
          });
          const brg = turf.bearing(turf.point(activeGreenCenter), turf.point(farPt));
          const teeCoord = turf.destination(turf.point(farPt), 38 * YARD_TO_M, brg, { units: "meters" }).geometry.coordinates;
          centerlineCoords = [teeCoord, primaryFairway.center, activeGreenCenter];
        } else {
          const teeCoord = turf.destination(turf.point(activeGreenCenter), 360 * YARD_TO_M, 180, { units: "meters" }).geometry.coordinates;
          centerlineCoords = [teeCoord, activeGreenCenter];
        }
      }

      if (centerlineCoords) {
        document.getElementById("preset-select").value = "empty";
        holeData.features = buildIsolatedHoleFeatures(centerlineCoords, parsed, forcedGreen);
        holeData.lidarGrid = null;
        syncMapFromState(true);
        showToast(`Pulled & saved Hole ${document.getElementById("meta-hole-num").value} (${holeData.features.length} vectors)!`);
      }
    });

    /********************************************************************
     * 5B. DENSE 2-YARD USGS 3DEP LIDAR ENGINE + MARCHING SQUARES CONTOURS
     *     Samples a 9x9 anchor matrix via USGS 3DEP and bicubic/bilinearly
     *     upsamples + Gaussian-smooths it to a dense 2-yard USGA grid
     *     (120–160 arrows) + 0.5ft contour lines!
     ********************************************************************/
    async function queryUSGSElevationFeet(lng, lat) {
      const url = `https://epqs.nationalmap.gov/v1/json?x=${lng.toFixed(6)}&y=${lat.toFixed(6)}&wkid=4326&units=Feet&includeDate=false`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const val = parseFloat(data.value);
      return isNaN(val) ? null : val;
    }

    // Build dense 2-yard green grid & 0.5ft contours from an anchor elevation matrix Z_raw
    function computeDenseGreenLidarField(Z_anchor, anchorCols, anchorRows, minX, maxX, minY, maxY, greenCenterElevFt, model, greenPoly, fringePoly, useApproachFrame = false) {
      // Interpolate to a dense 2.0-yard spacing grid (just like step=2 in plotter.py!)
      const stepYds = 2.0;
      const denseCols = Math.max(10, Math.round((maxX - minX) / stepYds) + 1);
      const denseRows = Math.max(10, Math.round((maxY - minY) / stepYds) + 1);
      const dxYds = (maxX - minX) / (denseCols - 1);
      const dyYds = (maxY - minY) / (denseRows - 1);

      // Bilinear interpolation from anchor grid
      let Z = Array.from({ length: denseRows }, () => Array(denseCols).fill(0));
      for (let r = 0; r < denseRows; r++) {
        const v = (r / (denseRows - 1)) * (anchorRows - 1);
        const r0 = Math.floor(v), r1 = Math.min(anchorRows - 1, r0 + 1);
        const fv = v - r0;
        for (let c = 0; c < denseCols; c++) {
          const u = (c / (denseCols - 1)) * (anchorCols - 1);
          const c0 = Math.floor(u), c1 = Math.min(anchorCols - 1, c0 + 1);
          const fu = u - c0;
          const z00 = Z_anchor[r0][c0] ?? greenCenterElevFt;
          const z10 = Z_anchor[r0][c1] ?? greenCenterElevFt;
          const z01 = Z_anchor[r1][c0] ?? greenCenterElevFt;
          const z11 = Z_anchor[r1][c1] ?? greenCenterElevFt;
          Z[r][c] = (1 - fv) * ((1 - fu) * z00 + fu * z10) + fv * ((1 - fu) * z01 + fu * z11);
        }
      }

      // Apply 3x3 Gaussian smoothing kernel (matches gaussian_filter(Z_meters, sigma=0.5) in dem_processor.py)
      const Z_smooth = Array.from({ length: denseRows }, () => Array(denseCols).fill(0));
      for (let r = 0; r < denseRows; r++) {
        for (let c = 0; c < denseCols; c++) {
          let sum = 0, wSum = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = Math.min(denseRows - 1, Math.max(0, r + dr));
              const nc = Math.min(denseCols - 1, Math.max(0, c + dc));
              const w = (dr === 0 && dc === 0) ? 4 : (dr === 0 || dc === 0) ? 2 : 1;
              sum += Z[nr][nc] * w;
              wSum += w;
            }
          }
          Z_smooth[r][c] = sum / wSum - greenCenterElevFt; // Relative to green centroid in feet!
        }
      }

      // Compute 2D Central-Difference Gradients (dz/dx and dz/dy in Feet/Feet -> Slope %)
      const dxFeet = dxYds * 3.0;
      const dyFeet = dyYds * 3.0;
      const arrows = [];
      let sumSlope = 0, sumSin = 0, sumCos = 0, countGreen = 0;

      for (let r = 0; r < denseRows; r++) {
        for (let c = 0; c < denseCols; c++) {
          const zC = Z_smooth[r][c];
          const cL = Math.max(0, c - 1), cR = Math.min(denseCols - 1, c + 1);
          const rB = Math.max(0, r - 1), rT = Math.min(denseRows - 1, r + 1);

          const gx = (Z_smooth[r][cR] - Z_smooth[r][cL]) / ((cR - cL || 1) * dxFeet);
          const gy = (Z_smooth[rT][c] - Z_smooth[rB][c]) / ((rT - rB || 1) * dyFeet);

          const slopePct = Math.hypot(gx, gy) * 100.0;
          if (slopePct < 0.35) continue; // Filter flat noise (< 0.35%)

          // Downhill vector is negative gradient (-gx, -gy)
          const downX = -gx;
          const downY = -gy;
          // Angle in clockwise degrees where 0 deg = Up (+Y), 90 deg = Right (+X), 180 deg = Down (-Y)
          const svgAngleDeg = ((Math.atan2(downX, downY) * 180) / Math.PI + 360) % 360;

          const xYds = minX + c * dxYds;
          const yYds = minY + r * dyYds;
          const lngLat = localYardsToLngLat(model.teeCoord, xYds, yYds, model.holeBearingDeg);
          const ptTurf = turf.point(lngLat);
          const inGreen = turf.booleanPointInPolygon(ptTurf, greenPoly);
          const inFringe = !inGreen && turf.booleanPointInPolygon(ptTurf, fringePoly);

          if (inGreen || inFringe) {
            if (inGreen) {
              sumSlope += slopePct;
              sumSin += Math.sin((svgAngleDeg * Math.PI) / 180);
              sumCos += Math.cos((svgAngleDeg * Math.PI) / 180);
              countGreen++;
            }
            arrows.push({
              r, c, xYds, yYds, lngLat,
              slopePct,
              svgAngleDeg,
              inFringe,
              zRelFt: zC
            });
          }
        }
      }

      // Extract 0.5-ft Contour Isolines via Marching Squares (matches levels = np.arange(min_z, max_z + 0.5, 0.5) in plotter.py)
      const contourSegments = [];
      let minZ = Infinity, maxZ = -Infinity;
      for (let r = 0; r < denseRows; r++) {
        for (let c = 0; c < denseCols; c++) {
          if (Z_smooth[r][c] < minZ) minZ = Z_smooth[r][c];
          if (Z_smooth[r][c] > maxZ) maxZ = Z_smooth[r][c];
        }
      }

      const startLevel = Math.floor(minZ * 2) / 2;
      const endLevel = Math.ceil(maxZ * 2) / 2;

      for (let level = startLevel; level <= endLevel; level += 0.5) {
        const levelSegs = [];
        for (let r = 0; r < denseRows - 1; r++) {
          for (let c = 0; c < denseCols - 1; c++) {
            const x0 = minX + c * dxYds, x1 = minX + (c + 1) * dxYds;
            const y0 = minY + r * dyYds, y1 = minY + (r + 1) * dyYds;
            // Check if cell center is inside green
            const cellLngLat = localYardsToLngLat(model.teeCoord, (x0 + x1) / 2, (y0 + y1) / 2, model.holeBearingDeg);
            if (!turf.booleanPointInPolygon(turf.point(cellLngLat), greenPoly)) continue;

            const z00 = Z_smooth[r][c], z10 = Z_smooth[r][c + 1];
            const z11 = Z_smooth[r + 1][c + 1], z01 = Z_smooth[r + 1][c];

            const crossings = [];
            if ((z00 < level) !== (z10 < level)) {
              const t = (level - z00) / (z10 - z00 || 1e-6);
              crossings.push({ x: x0 + t * (x1 - x0), y: y0 });
            }
            if ((z10 < level) !== (z11 < level)) {
              const t = (level - z10) / (z11 - z10 || 1e-6);
              crossings.push({ x: x1, y: y0 + t * (y1 - y0) });
            }
            if ((z11 < level) !== (z01 < level)) {
              const t = (level - z01) / (z11 - z01 || 1e-6);
              crossings.push({ x: x0 + t * (x1 - x0), y: y1 });
            }
            if ((z01 < level) !== (z00 < level)) {
              const t = (level - z00) / (z01 - z00 || 1e-6);
              crossings.push({ x: x0, y: y0 + t * (y1 - y0) });
            }
            if (crossings.length >= 2) {
              levelSegs.push({ p1: crossings[0], p2: crossings[1], level });
            }
          }
        }
        if (levelSegs.length > 0) {
          contourSegments.push({ level, segments: levelSegs });
        }
      }

      const avgSlope = (sumSlope / (countGreen || 1)).toFixed(1);
      const avgFallDeg = Math.round(((Math.atan2(sumSin, sumCos) * 180) / Math.PI + 360) % 360);

      return { arrows, contourSegments, greenCenterElevFt, avgSlope, avgFallDeg };
    }

    function generateSyntheticLidarGrid(model, greenFeat, slopePct = 2.8, slopeDirDeg = 215) {
      if (!greenFeat || greenFeat.coords.length < 4) return null;
      const greenPoly = turf.polygon([greenFeat.coords]);
      const fringePoly = turf.buffer(greenPoly, 1.35, { units: "meters" });
      const greenPtsYards = greenFeat.coords.map((c) => model.projectToHoleYards(c));
      const minX = Math.min(...greenPtsYards.map((p) => p.x)) - 2.5;
      const maxX = Math.max(...greenPtsYards.map((p) => p.x)) + 2.5;
      const minY = Math.min(...greenPtsYards.map((p) => p.y)) - 2.5;
      const maxY = Math.max(...greenPtsYards.map((p) => p.y)) + 2.5;

      const anchorCols = 8, anchorRows = 8;
      const rad = (slopeDirDeg * Math.PI) / 180;
      const fallX = Math.sin(rad);
      const fallY = Math.cos(rad);
      const slopeGrad = (slopePct / 100.0) * 3.0; // ft per yard

      const Z_anchor = Array.from({ length: anchorRows }, (_, r) => {
        const yYds = minY + (r / (anchorRows - 1)) * (maxY - minY);
        return Array.from({ length: anchorCols }, (_, c) => {
          const xYds = minX + (c / (anchorCols - 1)) * (maxX - minX);
          const tier = 0.45 * Math.sin((xYds * 0.16) + (yYds * 0.14));
          return -(xYds * fallX + yYds * fallY) * slopeGrad + tier;
        });
      });

      return computeDenseGreenLidarField(
        Z_anchor, anchorCols, anchorRows, minX, maxX, minY, maxY,
        0, model, greenPoly, fringePoly
      );
    }

    async function triggerLidarFetch(silent = false) {
      const greenFeat = holeData.features.find((f) => f.type === "green");
      if (!greenFeat || greenFeat.coords.length < 4) {
        if (!silent) showToast("Trace or import a Green polygon first before fetching LiDAR!");
        return;
      }

      const btnText = document.getElementById("lidar-btn-text");
      if (!silent && btnText) btnText.textContent = "Scanning...";
      if (!silent) {
        setStatus("Sampling USGS 3DEP 1-Meter LiDAR Elevation Service across Green & Fairway Targets...");
        showToast("Fetching Dense USGS 3DEP LiDAR Grid...");
      }

      try {
        const model = computeSpatialHoleModel();
        const greenPoly = turf.polygon([greenFeat.coords]);
        const fringePoly = turf.buffer(greenPoly, 1.35, { units: "meters" });

        // 1. Query Tee & Green Center elevations
        const [teeElevFt, greenCenterElevFt] = await Promise.all([
          queryUSGSElevationFeet(model.teeCoord[0], model.teeCoord[1]),
          queryUSGSElevationFeet(model.greenCentroidCoord[0], model.greenCentroidCoord[1])
        ]);

        if (teeElevFt !== null && greenCenterElevFt !== null) {
          const teeFeat = holeData.features.find((f) => f.type === "tee");
          if (teeFeat) {
            teeFeat.props = teeFeat.props || {};
            teeFeat.props.elev = Math.round((greenCenterElevFt - teeElevFt) / 3.0);
          }

          const targets = holeData.features.filter((f) => f.type === "target" || f.type === "tree");
          await Promise.all(
            targets.map(async (t) => {
              const tElevFt = await queryUSGSElevationFeet(t.coords[0], t.coords[1]);
              if (tElevFt !== null) {
                t.props = t.props || {};
                t.props.elev = Math.round((greenCenterElevFt - tElevFt) / 3.0);
              }
            })
          );
        }

        // 2. Sample an 8x8 anchor grid over the green and bicubic/bilinearly interpolate + Gaussian filter to a dense 2-yard grid!
        const greenPtsYards = greenFeat.coords.map((c) => model.projectToHoleYards(c));
        const minX = Math.min(...greenPtsYards.map((p) => p.x)) - 2.5;
        const maxX = Math.max(...greenPtsYards.map((p) => p.x)) + 2.5;
        const minY = Math.min(...greenPtsYards.map((p) => p.y)) - 2.5;
        const maxY = Math.max(...greenPtsYards.map((p) => p.y)) + 2.5;

        const anchorCols = 8, anchorRows = 8;
        const dxAnchor = (maxX - minX) / (anchorCols - 1);
        const dyAnchor = (maxY - minY) / (anchorRows - 1);

        const gridTasks = [];
        for (let r = 0; r < anchorRows; r++) {
          for (let c = 0; c < anchorCols; c++) {
            const xYds = minX + c * dxAnchor;
            const yYds = minY + r * dyAnchor;
            const lngLat = localYardsToLngLat(model.teeCoord, xYds, yYds, model.holeBearingDeg);
            gridTasks.push(
              queryUSGSElevationFeet(lngLat[0], lngLat[1]).then((zFt) => ({ r, c, zFt }))
            );
          }
        }

        const samples = await Promise.all(gridTasks);
        const Z_anchor = Array.from({ length: anchorRows }, () => Array(anchorCols).fill(null));
        samples.forEach((s) => { Z_anchor[s.r][s.c] = s.zFt; });

        const lidarResult = computeDenseGreenLidarField(
          Z_anchor, anchorCols, anchorRows, minX, maxX, minY, maxY,
          greenCenterElevFt || 0, model, greenPoly, fringePoly
        );

        if (lidarResult.arrows.length > 0) {
          holeData.lidarGrid = lidarResult;
          document.getElementById("meta-green-slope-pct").value = lidarResult.avgSlope;
          document.getElementById("meta-green-slope-dir").value = lidarResult.avgFallDeg;
          syncMapFromState(false);
          if (!silent) showToast(`USGS 3DEP LiDAR Loaded: ${lidarResult.arrows.length} dense vectors + 0.5ft contours!`);
          setStatus(`USGS 3DEP 1-Meter LiDAR active (${lidarResult.arrows.length} vectors, Avg Slope ${lidarResult.avgSlope}%).`);
        } else if (!silent) {
          showToast("No USGS 3DEP coverage at this location. Using synthetic model.");
        }
      } catch (err) {
        if (!silent) {
          console.error("USGS LiDAR error:", err);
          showToast("USGS 3DEP API busy — using synthetic model.");
        }
      } finally {
        if (btnText) btnText.textContent = "Fetch LiDAR";
      }
    }

    document.getElementById("lidar-fetch-btn").addEventListener("click", () => triggerLidarFetch(false));

    /********************************************************************
     * 6. DUAL-BEARING SPATIAL MODEL (Tee Bearing + Green Approach Bearing)
     *    & AUTO 20-YARD FAIRWAY CORRIDOR CUTOUT
     ********************************************************************/
    function computeSpatialHoleModel() {
      const teeFeat = holeData.features.find((f) => f.type === "tee");
      const greenFeat = holeData.features.find((f) => f.type === "green");
      const fwFeat = holeData.features.find((f) => f.type === "fairway");
      const centerFeat = holeData.features.find((f) => f.type === "centerline");

      const mapCenter = map.getCenter();
      let greenCentroidCoord = null;
      let greenPolyTurf = null;

      if (greenFeat && greenFeat.coords.length >= 4) {
        greenPolyTurf = turf.polygon([greenFeat.coords]);
        greenCentroidCoord = turf.centroid(greenPolyTurf).geometry.coordinates;
      } else if (centerFeat && centerFeat.coords.length >= 2) {
        greenCentroidCoord = centerFeat.coords[centerFeat.coords.length - 1];
      } else if (fwFeat && fwFeat.coords.length >= 4) {
        greenCentroidCoord = turf.centroid(turf.polygon([fwFeat.coords])).geometry.coordinates;
      } else {
        greenCentroidCoord = [mapCenter.lng, mapCenter.lat + 0.0015];
      }

      let teeCoord = teeFeat ? teeFeat.coords : null;
      if (teeCoord) {
        const distCheck = turf.distance(turf.point(teeCoord), turf.point(greenCentroidCoord), { units: "meters" });
        if (distCheck > 2000 || distCheck < 5) teeCoord = null;
      }

      if (!teeCoord) {
        if (centerFeat && centerFeat.coords.length >= 2) {
          teeCoord = centerFeat.coords[0];
        } else if (fwFeat && fwFeat.coords.length >= 4) {
          let maxD = -1, farPt = fwFeat.coords[0];
          fwFeat.coords.forEach((c) => {
            const d = turf.distance(turf.point(greenCentroidCoord), turf.point(c), { units: "meters" });
            if (d > maxD) { maxD = d; farPt = c; }
          });
          const brg = turf.bearing(turf.point(greenCentroidCoord), turf.point(farPt));
          teeCoord = turf.destination(turf.point(farPt), 35 * YARD_TO_M, brg, { units: "meters" }).geometry.coordinates;
        } else {
          teeCoord = turf.destination(turf.point(greenCentroidCoord), 350 * YARD_TO_M, 180, { units: "meters" }).geometry.coordinates;
        }
      }

      // 1. Primary Hole Bearing (Tee -> Green Center)
      const holeBearingDeg = (turf.bearing(turf.point(teeCoord), turf.point(greenCentroidCoord)) + 360) % 360;

      // 2. Green Approach Bearing (From last fairway dogleg pivot -> Green Center, used to orient USGA 1:480 Green view & Top Compass!)
      let approachOriginCoord = teeCoord;
      if (centerFeat && centerFeat.coords.length >= 3) {
        // Pick the penultimate node (the dogleg / approach point in the fairway)
        for (let i = centerFeat.coords.length - 2; i >= 0; i--) {
          const dToGreen = turf.distance(turf.point(centerFeat.coords[i]), turf.point(greenCentroidCoord), { units: "meters" }) * M_TO_YARD;
          if (dToGreen >= 35) {
            approachOriginCoord = centerFeat.coords[i];
            break;
          }
        }
      } else if (fwFeat && fwFeat.coords.length >= 4) {
        approachOriginCoord = turf.centroid(turf.polygon([fwFeat.coords])).geometry.coordinates;
      }
      const approachBearingDeg = (turf.bearing(turf.point(approachOriginCoord), turf.point(greenCentroidCoord)) + 360) % 360;

      // 3. Exact Front of Green Intersection Point (along approach line)
      let frontGreenCoord = [...greenCentroidCoord];
      if (greenPolyTurf) {
        const approachLine = centerFeat && centerFeat.coords.length >= 2
          ? turf.lineString(centerFeat.coords)
          : turf.lineString([approachOriginCoord, greenCentroidCoord]);

        const greenBoundary = turf.polygonToLine(greenPolyTurf);
        const intersections = turf.lineIntersect(approachLine, greenBoundary);

        if (intersections && intersections.features.length > 0) {
          let minDist = Infinity;
          intersections.features.forEach((ptFeat) => {
            const d = turf.distance(turf.point(approachOriginCoord), ptFeat, { units: "meters" });
            if (d < minDist) {
              minDist = d;
              frontGreenCoord = ptFeat.geometry.coordinates;
            }
          });
        } else {
          let minDist = Infinity;
          greenFeat.coords.forEach((c) => {
            const d = turf.distance(turf.point(approachOriginCoord), turf.point(c), { units: "meters" });
            if (d < minDist) {
              minDist = d;
              frontGreenCoord = c;
            }
          });
        }
      }

      // Project into Hole Frame (Tee -> Green = +Y)
      function projectToHoleYards(coord) {
        const distYards = turf.distance(turf.point(teeCoord), turf.point(coord), { units: "meters" }) * M_TO_YARD;
        if (distYards < 0.01) return { x: 0, y: 0 };
        const ptBearing = turf.bearing(turf.point(teeCoord), turf.point(coord));
        const relAngleRad = ((ptBearing - holeBearingDeg) * Math.PI) / 180;
        return {
          x: distYards * Math.sin(relAngleRad),
          y: distYards * Math.cos(relAngleRad)
        };
      }

      // Project into Green Approach Frame (Front of Green = (0,0), Approach Vector = +Y straight up!)
      function projectToApproachYards(coord) {
        const distYards = turf.distance(turf.point(frontGreenCoord), turf.point(coord), { units: "meters" }) * M_TO_YARD;
        if (distYards < 0.01) return { x: 0, y: 0 };
        const ptBearing = turf.bearing(turf.point(frontGreenCoord), turf.point(coord));
        const relAngleRad = ((ptBearing - approachBearingDeg) * Math.PI) / 180;
        return {
          x: distYards * Math.sin(relAngleRad),
          y: distYards * Math.cos(relAngleRad)
        };
      }

      function yardsFromTee(coord) {
        return Math.round(turf.distance(turf.point(teeCoord), turf.point(coord), { units: "meters" }) * M_TO_YARD);
      }

      function yardsToFrontGreen(coord) {
        return Math.round(turf.distance(turf.point(frontGreenCoord), turf.point(coord), { units: "meters" }) * M_TO_YARD);
      }

      const frontGreenXY = projectToHoleYards(frontGreenCoord);
      const greenCenterXY = projectToHoleYards(greenCentroidCoord);

      let totalHoleYards = yardsFromTee(greenCentroidCoord);
      if (centerFeat && centerFeat.coords.length >= 2) {
        totalHoleYards = Math.round(turf.length(turf.lineString(centerFeat.coords), { units: "meters" }) * M_TO_YARD);
      }

      let greenDepthYards = 30;
      let backGreenXY = { x: greenCenterXY.x, y: frontGreenXY.y + 30 };
      if (greenFeat && greenFeat.coords.length >= 4) {
        let maxY = -Infinity, minY = Infinity;
        let maxAppY = -Infinity, minAppY = Infinity;
        greenFeat.coords.forEach((c) => {
          const p = projectToHoleYards(c);
          const pApp = projectToApproachYards(c);
          if (p.y > maxY) { maxY = p.y; backGreenXY = p; }
          if (p.y < minY) minY = p.y;
          if (pApp.y > maxAppY) maxAppY = pApp.y;
          if (pApp.y < minAppY) minAppY = pApp.y;
        });
        greenDepthYards = Math.max(10, Math.round(maxAppY - minAppY));
      }

      // Compute Auto 20-Yard Fairway + Green Corridor Cutout Polygon
      let autoCorridorRing = null;
      const corridorYds = parseFloat(document.getElementById("meta-corridor-yds").value) || 20;
      try {
        const basePolys = [];
        holeData.features.filter((f) => f.type === "fairway" || f.type === "green").forEach((f) => {
          if (f.coords && f.coords.length >= 4) basePolys.push(turf.polygon([f.coords]));
        });
        if (basePolys.length > 0) {
          const fc = turf.featureCollection(basePolys);
          const buffered = turf.buffer(fc, corridorYds * YARD_TO_M, { units: "meters" });
          if (buffered && buffered.features && buffered.features.length > 0) {
            // Merge or pick largest buffered corridor ring
            let merged = buffered.features[0];
            for (let i = 1; i < buffered.features.length; i++) {
              try {
                const u = turf.union(merged, buffered.features[i]);
                if (u) merged = u;
              } catch (e) { }
            }
            const geom = merged.geometry;
            autoCorridorRing = geom.type === "MultiPolygon" ? geom.coordinates[0][0] : geom.coordinates[0];
          }
        }
      } catch (e) { }

      document.getElementById("telemetry-bearing").textContent = `${Math.round(holeBearingDeg)}°`;
      document.getElementById("telemetry-app-bearing").textContent = `${Math.round(approachBearingDeg)}°`;
      document.getElementById("telemetry-length").textContent = `${totalHoleYards}y`;
      document.getElementById("telemetry-depth").textContent = `${greenDepthYards}y`;

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
        autoCorridorRing,
        projectToHoleYards,
        projectToApproachYards,
        yardsFromTee,
        yardsToFrontGreen
      };
      window.__lastSpatialModel = model;
      return model;
    }

    /********************************************************************
     * 7. DUAL-SCALE TOUR YARDAGE BOOK & USGA 1:480 GREEN BOOK RENDERER
     ********************************************************************/
    function getSlopeColor(s) {
      if (s < 1) return '#56B4E9';
      if (s < 2) return '#0072B2';
      if (s < 3) return '#009E73';
      if (s < 4) return '#52B788';
      if (s < 5) return '#2D6A4F';
      if (s < 6) return '#E69F00';
      if (s < 7) return '#D55E00';
      if (s < 8) return '#CC3333';
      if (s < 9) return '#990000';
      return '#882255';
    }

    function catmullRomSplinePath(pts, closed = false, tension = 0.22) {
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

    function renderMoundHachuresSVG(screenPts, tickLen = 7, spacing = 8, outward = true) {
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

    function renderTreeCanopySVG(cx, cy, radiusPx) {
      const r = Math.max(10, radiusPx);
      let lobes = "";
      const lobeCount = 9;
      for (let i = 0; i < lobeCount; i++) {
        const ang = (i * 2 * Math.PI) / lobeCount;
        const lx = cx + Math.cos(ang) * (r * 0.42);
        const ly = cy + Math.sin(ang) * (r * 0.42);
        lobes += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${(r * 0.58).toFixed(1)}" fill="#b6ad99" fill-opacity="0.38" />`;
      }
      let branches = "";
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 + 0.3;
        const x2 = cx + Math.cos(ang) * (r * 0.72);
        const y2 = cy + Math.sin(ang) * (r * 0.72);
        branches += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#78716c" stroke-width="0.6" opacity="0.55" />`;
      }
      return `
        <g class="tour-tree">
          ${lobes}
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r * 0.85).toFixed(1)}" fill="none" stroke="#78716c" stroke-width="0.7" stroke-dasharray="2,2" opacity="0.7" />
          ${branches}
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.8" fill="#44403c" />
        </g>
      `;
    }

    function renderStackedYardageSVG(x, y, frontYds, carryYds, elev = 0, label = "", align = "center") {
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

    function renderCompassRoseSVG(cx, cy, bearingUpDeg, scale = 1) {
      // Since `bearingUpDeg` is rotated to point straight UP (0 deg on page),
      // True North (0 deg compass) is located at clockwise angle `-bearingUpDeg`!
      const northRotation = -bearingUpDeg;
      return `
        <g transform="translate(${cx}, ${cy}) scale(${scale}) rotate(${northRotation.toFixed(1)})">
          <line x1="0" y1="18" x2="0" y2="-22" stroke="#1c1917" stroke-width="1.3" />
          <line x1="-14" y1="0" x2="14" y2="0" stroke="#1c1917" stroke-width="1" />
          <polygon points="0,-25 -4.5,-13 0,-16 4.5,-13" fill="#1c1917" />
          <circle cx="0" cy="0" r="3" fill="#faf8f2" stroke="#1c1917" stroke-width="1.1" />
          <text x="0" y="-28" text-anchor="middle" class="font-tour" font-size="8.5" font-weight="700" fill="#1c1917">N</text>
          <text x="19" y="3" text-anchor="middle" class="font-tour" font-size="7.5" font-weight="600" fill="#57534e">E</text>
          <text x="-19" y="3" text-anchor="middle" class="font-tour" font-size="7.5" font-weight="600" fill="#57534e">W</text>
          <text x="0" y="26" text-anchor="middle" class="font-tour" font-size="7.5" font-weight="600" fill="#57534e">S</text>
        </g>
      `;
    }

    // Renders a Green Complex using ANY provided toScreen(ptYards) projection function!
    // NOTE: Arrow heads now point UP (0, -L/2) at 0° so `rotate(svgAngleDeg)` points in the exact downhill direction!
    function renderGreenWithProjection(model, toScreen, clipId = "green-clip-main", useColorLidar = false, degOffset = 0) {
      const greenFeat = holeData.features.find((f) => f.type === "green");
      if (!greenFeat || greenFeat.coords.length < 4) return "";

      const greenPtsYards = greenFeat.coords.map((c) => model.projectToHoleYards(c));
      const minX = Math.min(...greenPtsYards.map((p) => p.x)) - 4;
      const maxX = Math.max(...greenPtsYards.map((p) => p.x)) + 4;
      const minY = Math.min(...greenPtsYards.map((p) => p.y)) - 2;
      const maxY = Math.max(...greenPtsYards.map((p) => p.y)) + 2;

      const greenScreenPts = greenPtsYards.map(toScreen);
      const greenPathD = catmullRomSplinePath(greenScreenPts, true, 0.2);

      // 5-Yard Grid inside Green
      let gridLines = "";
      const startGridX = Math.floor(minX / 5) * 5;
      const endGridX = Math.ceil(maxX / 5) * 5;
      for (let gx = startGridX; gx <= endGridX; gx += 5) {
        const p1 = toScreen({ x: gx, y: minY });
        const p2 = toScreen({ x: gx, y: maxY });
        gridLines += `<line x1="${p1.sx.toFixed(1)}" y1="${p1.sy.toFixed(1)}" x2="${p2.sx.toFixed(1)}" y2="${p2.sy.toFixed(1)}" stroke="#78716c" stroke-width="0.45" opacity="0.55" />`;
      }

      const startGridY = Math.floor(minY / 5) * 5;
      const endGridY = Math.ceil(maxY / 5) * 5;
      for (let gy = startGridY; gy <= endGridY; gy += 5) {
        const p1 = toScreen({ x: minX, y: gy });
        const p2 = toScreen({ x: maxX, y: gy });
        gridLines += `<line x1="${p1.sx.toFixed(1)}" y1="${p1.sy.toFixed(1)}" x2="${p2.sx.toFixed(1)}" y2="${p2.sy.toFixed(1)}" stroke="#78716c" stroke-width="0.45" opacity="0.55" />`;
      }

      // 0.5-ft Contour Isolines (if LiDAR fetched)
      let contoursSVG = "";
      if (holeData.lidarGrid && holeData.lidarGrid.contourSegments) {
        holeData.lidarGrid.contourSegments.forEach((layer) => {
          layer.segments.forEach((seg, sIdx) => {
            const sp1 = toScreen(seg.p1);
            const sp2 = toScreen(seg.p2);
            contoursSVG += `<line x1="${sp1.sx.toFixed(1)}" y1="${sp1.sy.toFixed(1)}" x2="${sp2.sx.toFixed(1)}" y2="${sp2.sy.toFixed(1)}" stroke="#666666" stroke-width="0.65" opacity="0.85" />`;
            if (sIdx === Math.floor(layer.segments.length / 2) && useColorLidar) {
              const lbl = layer.level > 0 ? `+${layer.level.toFixed(1)}` : layer.level === 0 ? "0.0" : layer.level.toFixed(1);
              contoursSVG += `<text x="${sp1.sx.toFixed(1)}" y="${sp1.sy.toFixed(1)}" text-anchor="middle" font-family="Inter" font-size="6.5" font-weight="600" fill="#444444" stroke="#ffffff" stroke-width="1.5" paint-order="stroke">${lbl}</text>`;
            }
          });
        });
      }

      // Slope Arrows inside Green (Fixed Arrowhead at -Y so 0° = Straight Up!)
      let slopeArrows = "";
      if (holeData.lidarGrid && holeData.lidarGrid.arrows && holeData.lidarGrid.arrows.length > 0) {
        // On Full-Hole Tour Book page, thin slightly so 5x5 grid stays clean; on USGA / Zoom views, show EVERY 2-yard arrow!
        const stride = useColorLidar ? 1 : 2;
        holeData.lidarGrid.arrows.forEach((a, idx) => {
          if (!useColorLidar && a.inFringe) return;
          if (idx % stride !== 0) return;

          const sPt = toScreen({ x: a.xYds, y: a.yYds });
          const col = a.inFringe ? "#d05090" : (useColorLidar ? getSlopeColor(a.slopePct) : "#292524");
          const arrowLen = useColorLidar ? 11 : Math.min(15, 7 + a.slopePct * 1.6);
          const rotAngle = a.svgAngleDeg + degOffset;

          slopeArrows += `
            <g transform="translate(${sPt.sx.toFixed(1)}, ${sPt.sy.toFixed(1)}) rotate(${rotAngle.toFixed(1)})">
              <line x1="0" y1="${(arrowLen / 2).toFixed(1)}" x2="0" y2="${(-arrowLen / 2).toFixed(1)}" stroke="${col}" stroke-width="${useColorLidar ? 1.35 : 0.9}" opacity="${a.inFringe ? 0.55 : 0.92}" />
              <polygon points="0,${(-arrowLen / 2 - 2.4).toFixed(1)} -2.2,${(-arrowLen / 2 + 2.2).toFixed(1)} 2.2,${(-arrowLen / 2 + 2.2).toFixed(1)}" fill="${col}" opacity="${a.inFringe ? 0.55 : 0.92}" />
            </g>
          `;
          if (useColorLidar && !a.inFringe && idx % 9 === 0) {
            slopeArrows += `<text x="${sPt.sx.toFixed(1)}" y="${(sPt.sy + 2).toFixed(1)}" text-anchor="middle" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="#000000" stroke="#ffffff" stroke-width="1.8" paint-order="stroke">${a.slopePct.toFixed(1)}</text>`;
          }
        });
      } else {
        const slopeDirDeg = parseFloat(document.getElementById("meta-green-slope-dir").value) || 215;
        const slopePct = parseFloat(document.getElementById("meta-green-slope-pct").value) || 2.8;
        const stepYds = useColorLidar ? 2.2 : 4.2;

        let idx = 0;
        for (let gx = minX + 2; gx <= maxX - 2; gx += stepYds) {
          for (let gy = minY + 2; gy <= maxY - 2; gy += stepYds) {
            const sPt = toScreen({ x: gx, y: gy });
            const localAngle = slopeDirDeg + degOffset + 14 * Math.sin((gx + gy) * 0.18);
            const localSlope = Math.max(0.6, slopePct + 0.85 * Math.sin(gx * 0.25) + 0.4 * Math.cos(gy * 0.2));
            const col = useColorLidar ? getSlopeColor(localSlope) : "#292524";
            const arrowLen = useColorLidar ? 11 : Math.min(15, 7 + localSlope * 1.6);
            slopeArrows += `
              <g transform="translate(${sPt.sx.toFixed(1)}, ${sPt.sy.toFixed(1)}) rotate(${localAngle.toFixed(1)})">
                <line x1="0" y1="${(arrowLen / 2).toFixed(1)}" x2="0" y2="${(-arrowLen / 2).toFixed(1)}" stroke="${col}" stroke-width="${useColorLidar ? 1.35 : 0.85}" opacity="0.88" />
                <polygon points="0,${(-arrowLen / 2 - 2.4).toFixed(1)} -2.2,${(-arrowLen / 2 + 2.2).toFixed(1)} 2.2,${(-arrowLen / 2 + 2.2).toFixed(1)}" fill="${col}" opacity="0.88" />
              </g>
            `;
            if (useColorLidar && idx % 11 === 0) {
              slopeArrows += `<text x="${sPt.sx.toFixed(1)}" y="${(sPt.sy + 2).toFixed(1)}" text-anchor="middle" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="#000000" stroke="#ffffff" stroke-width="1.8" paint-order="stroke">${localSlope.toFixed(1)}</text>`;
            }
            idx++;
          }
        }
      }

      // Green Depth Spine Callouts
      let depthCallouts = "";
      const depthSteps = [3, 9, 15, 21, 27];
      depthSteps.forEach((dYds) => {
        if (dYds < model.greenDepthYards - 3) {
          const dPt = toScreen({ x: model.frontGreenXY.x - 1.5, y: model.frontGreenXY.y + dYds });
          depthCallouts += `<text x="${dPt.sx.toFixed(1)}" y="${dPt.sy.toFixed(1)}" text-anchor="middle" class="font-tour" font-size="9.5" font-weight="600" fill="#1c1917" stroke="#faf8f2" stroke-width="2" paint-order="stroke">${dYds}</text>`;
        }
      });
      const backEdgePt = toScreen({ x: model.backGreenXY.x, y: model.backGreenXY.y - 1 });
      depthCallouts += `<text x="${backEdgePt.sx.toFixed(1)}" y="${backEdgePt.sy.toFixed(1)}" text-anchor="middle" class="font-tour" font-size="11" font-weight="700" fill="#b91c1c" stroke="#faf8f2" stroke-width="2.5" paint-order="stroke">${model.greenDepthYards}</text>`;

      // Greenside Bunkers (with Front & Back lip yardages relative to Front of Green)
      let greensideBunkersSVG = "";
      holeData.features
        .filter((f) => f.type === "bunker")
        .forEach((bunk) => {
          const bPtsYards = bunk.coords.map((c) => model.projectToHoleYards(c));
          const avgY = bPtsYards.reduce((acc, p) => acc + p.y, 0) / bPtsYards.length;
          if (avgY < model.frontGreenXY.y - 32) return;

          const bScreen = bPtsYards.map(toScreen);
          const bPath = catmullRomSplinePath(bScreen, true, 0.2);

          let minFrontDist = Infinity;
          let maxFrontDist = -Infinity;
          let minPt = bScreen[0];
          let maxPt = bScreen[0];

          bPtsYards.forEach((p, idx) => {
            const distFromFront = Math.round(Math.hypot(p.x - model.frontGreenXY.x, p.y - model.frontGreenXY.y));
            if (distFromFront < minFrontDist) {
              minFrontDist = distFromFront;
              minPt = bScreen[idx];
            }
            if (distFromFront > maxFrontDist) {
              maxFrontDist = distFromFront;
              maxPt = bScreen[idx];
            }
          });

          const dx = bunk.props?.dx || 0;
          const dy = bunk.props?.dy || 0;

          greensideBunkersSVG += `
            <g class="greenside-bunker cursor-grab" data-id="${bunk.id}">
              ${renderMoundHachuresSVG(bScreen, 5, 7, true)}
              <path d="${bPath}" fill="#f1e6b2" stroke="#1c1917" stroke-width="1.2" />
              <text x="${(minPt.sx + dx).toFixed(1)}" y="${(minPt.sy + 3 + dy).toFixed(1)}" text-anchor="middle" class="font-tour" font-size="10" font-weight="700" fill="#1c1917" stroke="#faf8f2" stroke-width="2.2" paint-order="stroke">${minFrontDist}</text>
              <text x="${(maxPt.sx + dx).toFixed(1)}" y="${(maxPt.sy + 4 + dy).toFixed(1)}" text-anchor="middle" class="font-tour" font-size="10.5" font-weight="700" fill="#1c1917" stroke="#faf8f2" stroke-width="2.2" paint-order="stroke">${maxFrontDist}</text>
            </g>
          `;
        });

      const apex1 = toScreen({ x: model.greenCenterXY.x - 4, y: model.frontGreenXY.y + model.greenDepthYards * 0.42 });
      const apex2 = toScreen({ x: model.greenCenterXY.x + 4, y: model.frontGreenXY.y + model.greenDepthYards * 0.68 });

      const runoffBase = toScreen({ x: model.greenCenterXY.x - 5, y: model.backGreenXY.y });
      const runoffArrows = `
        <g transform="translate(${runoffBase.sx.toFixed(1)}, ${runoffBase.sy.toFixed(1)})" stroke="#1c1917" stroke-width="1.1" fill="none">
          <path d="M -8,6 Q -12,-6 -16,-14" />
          <polyline points="-18,-10 -16,-14 -12,-12" />
          <path d="M 2,3 Q -2,-9 -6,-17" />
          <polyline points="-8,-13 -6,-17 -2,-15" />
          <path d="M 12,1 Q 8,-10 4,-18" />
          <polyline points="2,-14 4,-18 8,-16" />
        </g>
      `;

      return `
        <g class="green-complex-group">
          <defs>
            <clipPath id="${clipId}">
              <path d="${greenPathD}" />
            </clipPath>
          </defs>

          ${renderMoundHachuresSVG(greenScreenPts, 7, 8, true)}
          <path d="${greenPathD}" fill="none" stroke="#1c1917" stroke-width="3.4" />
          <path d="${greenPathD}" fill="#eef2eb" stroke="#faf8f2" stroke-width="1.5" />

          <g clip-path="url(#${clipId})">
            ${gridLines}
            ${contoursSVG}
            ${slopeArrows}
            <ellipse cx="${apex1.sx.toFixed(1)}" cy="${apex1.sy.toFixed(1)}" rx="4" ry="2.6" fill="#f97316" opacity="0.85" />
            <circle cx="${apex2.sx.toFixed(1)}" cy="${apex2.sy.toFixed(1)}" r="2.6" fill="#10b981" opacity="0.85" />
          </g>

          <path d="${greenPathD}" fill="none" stroke="#1c1917" stroke-width="1.5" />

          ${runoffArrows}
          ${greensideBunkersSVG}
          ${depthCallouts}
        </g>
      `;
    }

    function renderZoomedGreenBox(model, boxX, boxY, boxW, boxH, clipId, useColorLidar = false) {
      const greenFeat = holeData.features.find((f) => f.type === "green");
      if (!greenFeat || greenFeat.coords.length < 4) return "";

      const greenPtsYards = greenFeat.coords.map((c) => model.projectToHoleYards(c));
      const minX = Math.min(...greenPtsYards.map((p) => p.x)) - 12;
      const maxX = Math.max(...greenPtsYards.map((p) => p.x)) + 12;
      const minY = Math.min(...greenPtsYards.map((p) => p.y)) - 10;
      const maxY = Math.max(...greenPtsYards.map((p) => p.y)) + 8;

      const spanX = Math.max(26, maxX - minX);
      const spanY = Math.max(26, maxY - minY);
      const pxPerYard = Math.min((boxW - 36) / spanX, (boxH - 32) / spanY);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const toZoomScreen = (ptYards) => ({
        sx: boxX + boxW / 2 + (ptYards.x - centerX) * pxPerYard,
        sy: boxY + boxH / 2 - (ptYards.y - centerY) * pxPerYard
      });

      return renderGreenWithProjection(model, toZoomScreen, clipId, useColorLidar);
    }

    // Dedicated Renderer for the USGA 1:480 Scale Green Contour Book (Oriented by Approach Bearing + Dense 2-Yard Arrows!)
    function renderUSGA1480PageSVG(model) {
      const holeNum = document.getElementById("meta-hole-num").value || 1;
      const holePar = document.getElementById("meta-hole-par").value || 4;
      const courseName = document.getElementById("meta-course-name").value || "Lakeview";
      const greenFeat = holeData.features.find((f) => f.type === "green");

      if (!greenFeat || greenFeat.coords.length < 4) {
        return `<rect width="540" height="900" fill="#ffffff" /><text x="270" y="450" text-anchor="middle" font-family="Inter" font-size="16" fill="#333">Trace or Pull an OSM Green Polygon first.</text>`;
      }

      // Project Green into the APPROACH Bearing Frame so the entrance throat is at the bottom (0 yards depth)
      const degDiff = model.holeBearingDeg - model.approachBearingDeg;
      const radDiff = (degDiff * Math.PI) / 180;
      const rotateHolePtToApp = (ptHole) => {
        const dx = ptHole.x - model.frontGreenXY.x;
        const dy = ptHole.y - model.frontGreenXY.y;
        return {
          x: dx * Math.cos(radDiff) + dy * Math.sin(radDiff),
          y: -dx * Math.sin(radDiff) + dy * Math.cos(radDiff)
        };
      };

      const greenPtsApp = greenFeat.coords.map((c) => rotateHolePtToApp(model.projectToHoleYards(c)));
      const minGX = Math.min(...greenPtsApp.map((p) => p.x));
      const maxGX = Math.max(...greenPtsApp.map((p) => p.x));
      const minGY = Math.min(...greenPtsApp.map((p) => p.y));
      const maxGY = Math.max(...greenPtsApp.map((p) => p.y));
      const cx = (minGX + maxGX) / 2;
      const cy = (minGY + maxGY) / 2;

      const boxX = 0, boxY = 360, boxW = 540, boxH = 540;
      const greenSpanW = Math.max(44, maxGX - minGX + 16);
      const greenSpanH = Math.max(44, maxGY - minGY + 16);
      const pxPerYard = Math.min(boxW / greenSpanW, (boxH - 50) / greenSpanH);

      const toUSGAFromApp = (ptApp) => ({
        sx: boxX + boxW / 2 + (ptApp.x - cx) * pxPerYard,
        sy: boxY + (boxH - 35) / 2 - (ptApp.y - cy) * pxPerYard
      });

      const toUSGAFromHole = (ptHole) => toUSGAFromApp(rotateHolePtToApp(ptHole));

      // 1-Yard and 5-Yard Full Background Grid (anchored to front of green minGY and center cx)
      let gridSVG = "";
      for (let n = -35; n <= 35; n++) {
        const xVal = cx + n;
        const p1 = toUSGAFromApp({ x: xVal, y: cy - 35 });
        const p2 = toUSGAFromApp({ x: xVal, y: cy + 35 });
        const is5 = n % 5 === 0;
        gridSVG += `<line x1="${p1.sx.toFixed(1)}" y1="360" x2="${p2.sx.toFixed(1)}" y2="855" stroke="${is5 ? '#d5d5d5' : '#f0f0f0'}" stroke-width="${is5 ? '0.9' : '0.45'}" />`;
      }
      for (let n = -15; n <= 45; n++) {
        const yVal = minGY + n;
        const p1 = toUSGAFromApp({ x: cx - 35, y: yVal });
        const p2 = toUSGAFromApp({ x: cx + 35, y: yVal });
        if (p1.sy >= 360 && p1.sy <= 855) {
          const is5 = n % 5 === 0;
          gridSVG += `<line x1="0" y1="${p1.sy.toFixed(1)}" x2="540" y2="${p1.sy.toFixed(1)}" stroke="${is5 ? '#d5d5d5' : '#f0f0f0'}" stroke-width="${is5 ? '0.9' : '0.45'}" />`;
        }
      }

      // Bunkers
      let bunkersSVG = "";
      holeData.features.filter((f) => f.type === "bunker").forEach((b) => {
        const bPtsApp = b.coords.map((c) => rotateHolePtToApp(model.projectToHoleYards(c)));
        const avgY = bPtsApp.reduce((a, p) => a + p.y, 0) / bPtsApp.length;
        if (avgY < minGY - 25) return;
        const bPath = catmullRomSplinePath(bPtsApp.map(toUSGAFromApp), true, 0.2);
        bunkersSVG += `<path d="${bPath}" fill="#e5dacc" fill-opacity="0.85" stroke="#b0b0b0" stroke-width="1.1" />`;
      });

      // Fringe (1.2m dashed collar around green)
      const fringeTurf = turf.buffer(turf.polygon([greenFeat.coords]), 1.2, { units: "meters" });
      const fringeScreen = fringeTurf.geometry.coordinates[0].map((c) => toUSGAFromHole(model.projectToHoleYards(c)));
      const fringePathD = catmullRomSplinePath(fringeScreen, true, 0.2);

      const greenScreen = greenPtsApp.map(toUSGAFromApp);
      const greenPathD = catmullRomSplinePath(greenScreen, true, 0.2);

      // Depth Labels Hugging Left & Right Boundary of Green Every 5 Yards
      let sideDepthLabels = "";
      const totalDepth = Math.max(10, Math.round(maxGY - minGY));
      for (let dYds = 0; dYds <= totalDepth; dYds += 5) {
        const targetY = minGY + dYds;
        const nearPts = greenPtsApp.filter((p) => Math.abs(p.y - targetY) < 2.6);
        if (nearPts.length > 0) {
          const leftX = Math.min(...nearPts.map((p) => p.x));
          const rightX = Math.max(...nearPts.map((p) => p.x));
          const pL = toUSGAFromApp({ x: leftX - 1.5, y: targetY });
          const pR = toUSGAFromApp({ x: rightX + 1.5, y: targetY });
          sideDepthLabels += `
            <text x="${pL.sx.toFixed(1)}" y="${(pL.sy + 3).toFixed(1)}" text-anchor="end" font-family="Inter" font-size="9.5" font-weight="700" fill="#555555">${dYds}</text>
            <text x="${pR.sx.toFixed(1)}" y="${(pR.sy + 3).toFixed(1)}" text-anchor="start" font-family="Inter" font-size="9.5" font-weight="700" fill="#555555">${dYds}</text>
          `;
        }
      }

      // 0.5-ft Contours & Dense 2-Yard Slope Arrows (Fixed Arrowhead at -Y so 0° = Up!)
      let contoursSVG = "";
      if (holeData.lidarGrid && holeData.lidarGrid.contourSegments) {
        holeData.lidarGrid.contourSegments.forEach((layer) => {
          layer.segments.forEach((seg, sIdx) => {
            const sp1 = toUSGAFromHole(seg.p1);
            const sp2 = toUSGAFromHole(seg.p2);
            contoursSVG += `<line x1="${sp1.sx.toFixed(1)}" y1="${sp1.sy.toFixed(1)}" x2="${sp2.sx.toFixed(1)}" y2="${sp2.sy.toFixed(1)}" stroke="#666666" stroke-width="0.75" opacity="0.85" />`;
            if (sIdx === Math.floor(layer.segments.length / 2)) {
              const lbl = layer.level > 0 ? `+${layer.level.toFixed(1)}` : layer.level === 0 ? "0.0" : layer.level.toFixed(1);
              contoursSVG += `<text x="${sp1.sx.toFixed(1)}" y="${sp1.sy.toFixed(1)}" text-anchor="middle" font-family="Inter" font-size="7" font-weight="600" fill="#444444" stroke="#ffffff" stroke-width="1.8" paint-order="stroke">${lbl}</text>`;
            }
          });
        });
      }

      let arrowsSVG = "";
      const slopeDirDeg = parseFloat(document.getElementById("meta-green-slope-dir").value) || 215;
      const slopePct = parseFloat(document.getElementById("meta-green-slope-pct").value) || 2.8;

      if (holeData.lidarGrid && holeData.lidarGrid.arrows && holeData.lidarGrid.arrows.length > 0) {
        holeData.lidarGrid.arrows.forEach((a, idx) => {
          const sPt = toUSGAFromHole({ x: a.xYds, y: a.yYds });
          const col = a.inFringe ? "#d05090" : getSlopeColor(a.slopePct);
          const op = a.inFringe ? "0.55" : "0.95";
          const rotAng = a.svgAngleDeg + degDiff;
          arrowsSVG += `
            <g transform="translate(${sPt.sx.toFixed(1)}, ${sPt.sy.toFixed(1)}) rotate(${rotAng.toFixed(1)})" opacity="${op}">
              <line x1="0" y1="6.5" x2="0" y2="-6.5" stroke="${col}" stroke-width="1.5" />
              <polygon points="0,-9.5 -2.8,-3.5 2.8,-3.5" fill="${col}" />
            </g>
          `;
          if (!a.inFringe && idx % 9 === 0) {
            arrowsSVG += `<text x="${sPt.sx.toFixed(1)}" y="${(sPt.sy + 2).toFixed(1)}" text-anchor="middle" font-family="Inter" font-size="8.5" font-weight="700" fill="#000" stroke="#fff" stroke-width="2" paint-order="stroke">${a.slopePct.toFixed(1)}</text>`;
          }
        });
      } else {
        // Dense 2.1-Yard Synthetic Grid (matches step=2 in plotter.py)
        let idx = 0;
        for (let gx = minGX + 1.5; gx <= maxGX - 1.5; gx += 2.1) {
          for (let gy = minGY + 1.5; gy <= maxGY - 1.5; gy += 2.1) {
            const sPt = toUSGAFromApp({ x: gx, y: gy });
            const locAng = slopeDirDeg + 16 * Math.sin((gx + gy) * 0.18);
            const locSlope = Math.max(0.6, slopePct + 0.9 * Math.cos((gx - gy) * 0.22));
            const col = getSlopeColor(locSlope);
            arrowsSVG += `
              <g transform="translate(${sPt.sx.toFixed(1)}, ${sPt.sy.toFixed(1)}) rotate(${locAng.toFixed(1)})">
                <line x1="0" y1="6.5" x2="0" y2="-6.5" stroke="${col}" stroke-width="1.5" />
                <polygon points="0,-9.5 -2.8,-3.5 2.8,-3.5" fill="${col}" />
              </g>
            `;
            if (idx % 12 === 0) {
              arrowsSVG += `<text x="${sPt.sx.toFixed(1)}" y="${(sPt.sy + 2).toFixed(1)}" text-anchor="middle" font-family="Inter" font-size="8.5" font-weight="700" fill="#000" stroke="#fff" stroke-width="2" paint-order="stroke">${locSlope.toFixed(1)}</text>`;
            }
            idx++;
          }
        }
      }

      // 10-Band Okabe-Ito Legend Bar at Bottom
      const legendColors = ['#56B4E9', '#0072B2', '#009E73', '#52B788', '#2D6A4F', '#E69F00', '#D55E00', '#CC3333', '#990000', '#882255'];
      const legendLabels = ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9+'];
      const barW = 46;
      const legendSVG = legendColors
        .map(
          (c, i) => `
          <rect x="${40 + i * barW}" y="862" width="${barW}" height="14" fill="${c}" />
          <text x="${40 + i * barW + barW / 2}" y="888" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#333">${legendLabels[i]}</text>
        `
        )
        .join("");

      return `
        <rect x="0" y="0" width="540" height="900" fill="#ffffff" />

        <!-- Top 40% Notes Section -->
        <text x="28" y="42" font-family="Inter" font-size="14" font-weight="700" fill="#a0a0a0">NOTES</text>
        <text x="512" y="46" text-anchor="end" font-family="Inter" font-size="28" font-weight="800" fill="#333333">HOLE ${holeNum}</text>
        <text x="512" y="70" text-anchor="end" font-family="Inter" font-size="14" font-weight="700" fill="#27ae60">PAR ${holePar}  |  ${model.totalHoleYards} YDS</text>

        <!-- Bottom 60% USGA 1:480 Green Contour Section -->
        ${gridSVG}
        ${bunkersSVG}
        <path d="${fringePathD}" fill="#ffffff" fill-opacity="0.6" stroke="#777777" stroke-width="1.2" stroke-dasharray="4,3" />
        <path d="${greenPathD}" fill="#ffffff" fill-opacity="0.45" stroke="#3a8c54" stroke-width="3.2" />

        <defs><clipPath id="usga-page-clip"><path d="${fringePathD}" /></clipPath></defs>
        <g clip-path="url(#usga-page-clip)">
          ${contoursSVG}
          ${arrowsSVG}
        </g>

        ${sideDepthLabels}

        <!-- Compass (Oriented by Exact Approach Bearing!), Course Name & Total Depth Header -->
        ${renderCompassRoseSVG(48, 415, model.approachBearingDeg, 1.0)}
        <text x="105" y="422" font-family="Inter" font-size="20" font-weight="700" fill="#111111">${courseName}</text>
        <text x="510" y="420" text-anchor="end" font-family="Inter" font-size="34" font-weight="800" fill="#333333">${totalDepth}</text>

        ${legendSVG}

        <line x1="0" y1="360" x2="540" y2="360" stroke="#27ae60" stroke-width="2.5" />
        <rect x="4" y="4" width="532" height="892" fill="none" stroke="#5c805c" stroke-width="7" />
      `;
    }

    function renderYardageBookSVG() {
      const svg = document.getElementById("yardage-book-svg");
      const model = computeSpatialHoleModel();

      const holeNum = document.getElementById("meta-hole-num").value || 1;
      const holePar = document.getElementById("meta-hole-par").value || 4;
      const greenZoomRatio = parseFloat(document.getElementById("meta-green-zoom").value) || 2.3;

      if (viewMode === "usga") {
        svg.setAttribute("viewBox", "0 0 540 900");
        svg.innerHTML = renderUSGA1480PageSVG(model);
        return;
      }

      if (viewMode === "green") {
        svg.setAttribute("viewBox", "0 0 540 720");
        svg.innerHTML = `
          <rect x="0" y="0" width="540" height="720" fill="#faf8f2" />
          <rect x="14" y="14" width="512" height="692" fill="none" stroke="#1c1917" stroke-width="1.5" />
          <text x="270" y="46" text-anchor="middle" class="font-tour" font-size="22" font-weight="700" fill="#1c1917" letter-spacing="1">HOLE ${holeNum} — GREEN COMPLEX (5x5 YD GRID)</text>
          <text x="270" y="64" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#57534e">Total Depth: ${model.greenDepthYards} Yds • Approach Bearing: ${Math.round(model.approachBearingDeg)}°</text>
          ${renderZoomedGreenBox(model, 35, 80, 470, 560, "green-clip-only", Boolean(holeData.lidarGrid))}
          ${renderCompassRoseSVG(475, 650, model.approachBearingDeg, 1.05)}
          <text x="35" y="685" class="font-tour" font-size="14" font-weight="700" fill="#1c1917">PAR ${holePar} • ${model.totalHoleYards} YDS</text>
        `;
        return;
      }

      svg.setAttribute("viewBox", "0 0 540 940");

      // Check if user drew a custom Crop Border polygon
      const cropFeat = holeData.features.find((f) => f.type === "crop");

      const allYardsPts = [];
      if (cropFeat && cropFeat.coords.length >= 4) {
        cropFeat.coords.forEach((c) => allYardsPts.push(model.projectToHoleYards(c)));
      } else {
        holeData.features.forEach((f) => {
          if (f.type === "tee" || f.type === "centerline") return;
          if (Array.isArray(f.coords[0])) {
            f.coords.forEach((c) => allYardsPts.push(model.projectToHoleYards(c)));
          } else {
            allYardsPts.push(model.projectToHoleYards(f.coords));
          }
        });
      }

      const minYData = allYardsPts.length ? Math.min(...allYardsPts.map((p) => p.y)) : 180;
      const minXData = allYardsPts.length ? Math.min(...allYardsPts.map((p) => p.x)) : -35;
      const maxXData = allYardsPts.length ? Math.max(...allYardsPts.map((p) => p.x)) : 35;

      // Tour Books start the Fairway Landing Zone around ~190 yards out from the green (or where the fairway polygon begins)
      const plotMinY = cropFeat
        ? minYData
        : Math.max(30, Math.min(model.frontGreenXY.y - 165, minYData - 12));
      const halfSpanX = cropFeat
        ? Math.max(20, (maxXData - minXData) / 2 + 2)
        : Math.max(40, Math.max(Math.abs(minXData), Math.abs(maxXData)) + 12);
      const midX = cropFeat ? (minXData + maxXData) / 2 : 0;

      // PIECEWISE DUAL-SCALE PROJECTION (StrackaLine / Tour Sherpa Golf Secret!)
      // In Full-Hole Tour Book Mode:
      // - Top Zone (y >= yNeck): Green Complex rendered at exact USGA 1:480 scale (7.2 px/yd screen standard)
      // - Bottom Zone (y < yNeck): Fairway Landing Corridor condensed/scrunched vertically to fit from `syNeck` down to `835px`
      // - Smooth blend across [-16 yds, +2 yds] so the fairway neck connects seamlessly!
      const yNeck = model.frontGreenXY.y - 6; // Transition datum 6 yards short of front green edge
      const greenSpanY = Math.max(28, model.backGreenXY.y + 6 - yNeck);
      const fwSpanY = Math.max(90, yNeck - plotMinY);

      const topOffset = viewMode === "split" ? 285 : 26;
      const totalPlotHeight = viewMode === "split" ? 550 : 795;

      // Base fairway scale & USGA 1:480 Green Scale
      const usga1480GreenScale = 7.2; // 1 yard = 7.2px (3/8" per 5 yds at 96 DPI)
      const baseFwPxPerYard = Math.min(390 / (halfSpanX * 2), 600 / fwSpanY);
      const greenPxPerYard = viewMode === "split"
        ? baseFwPxPerYard
        : Math.min(7.6, Math.max(5.5, usga1480GreenScale * (greenZoomRatio / 2.3)));

      // Screen Y position of the Neck transition (gives green top ~26-28% of page)
      const syNeck = viewMode === "split"
        ? topOffset + greenSpanY * baseFwPxPerYard
        : Math.min(275, Math.max(205, topOffset + greenSpanY * greenPxPerYard));

      // Fairway vertical compression (scrunches fairway to take up the full available lower 580px!)
      const availableFwHeight = 835 - syNeck;
      const actualFwPxPerYardY = Math.max(0.65, availableFwHeight / fwSpanY);
      // Fairway lateral scale (fills page width ~360px comfortably, matching Photos 1 & 2)
      const actualFwPxPerYardX = Math.min(4.5, 360 / (halfSpanX * 2));
      const actualFwPxPerYard = actualFwPxPerYardY;

      // Rigid Euclidean transform for the Green Complex (zero tearing, physically exact)
      function greenYardsToPage(ptYards) {
        const panDx = (holeData.meta && holeData.meta.pagePan && holeData.meta.pagePan.dx) || 0;
        const panDy = (holeData.meta && holeData.meta.pagePan && holeData.meta.pagePan.dy) || 0;
        return {
          sx: 270 + (ptYards.x - model.greenCenterXY.x) * greenPxPerYard + panDx,
          sy: syNeck - (ptYards.y - yNeck) * greenPxPerYard + panDy
        };
      }

      function yardsToPage(ptYards) {
        const dyFromNeck = ptYards.y - yNeck;
        const panDx = (holeData.meta && holeData.meta.pagePan && holeData.meta.pagePan.dx) || 0;
        const panDy = (holeData.meta && holeData.meta.pagePan && holeData.meta.pagePan.dy) || 0;

        if (dyFromNeck >= 0) {
          return {
            sx: 270 + (ptYards.x - model.greenCenterXY.x) * greenPxPerYard + panDx,
            sy: syNeck - dyFromNeck * greenPxPerYard + panDy
          };
        }

        // Smooth hermite blend factor across the approach collar [-16, +2]
        const t = Math.max(0, Math.min(1, (dyFromNeck + 16) / 18));
        const smoothW = t * t * (3 - 2 * t);

        const localScaleX = actualFwPxPerYardX + (greenPxPerYard - actualFwPxPerYardX) * smoothW;
        const centerRefX = midX * (1 - smoothW) + model.greenCenterXY.x * smoothW;
        const sy = syNeck - dyFromNeck * actualFwPxPerYardY;

        return {
          sx: 270 + (ptYards.x - centerRefX) * localScaleX + panDx,
          sy: sy + panDy
        };
      }

      let svgContent = `
        <rect x="0" y="0" width="540" height="940" fill="#faf8f2" />
      `;

      if (viewMode === "split") {
        svgContent += `
          <rect x="18" y="14" width="504" height="258" fill="#f5f2e8" stroke="#1c1917" stroke-width="1.2" rx="4" />
          <text x="30" y="34" class="font-tour" font-size="13" font-weight="700" fill="#1c1917" letter-spacing="0.5">GREEN DETAIL (DEPTH: ${model.greenDepthYards} YDS)</text>
          ${renderZoomedGreenBox(model, 95, 18, 350, 248, "green-clip-split", Boolean(holeData.lidarGrid))}
        `;
      }

      // 1. SIDE MARGIN YARDAGE LADDERS
      if (showLadders) {
        const ladderDistancesToFront = [40, 60, 80, 100, 125, 150, 175, 195, 220, 245];
        ladderDistancesToFront.forEach((distFront) => {
          const yCoord = model.frontGreenXY.y - distFront;
          if (yCoord < plotMinY + 4 || yCoord > model.frontGreenXY.y - 25) return;

          const sPt = yardsToPage({ x: 0, y: yCoord });
          if (sPt.sy < syNeck + 10 || sPt.sy > 828) return;

          const carryAtRing = Math.max(0, Math.round(yCoord));

          svgContent += `
            <g class="margin-ladder-left">
              <line x1="46" y1="${sPt.sy.toFixed(1)}" x2="155" y2="${sPt.sy.toFixed(1)}" stroke="#a8a29e" stroke-width="0.6" stroke-dasharray="2,3" />
              <circle cx="32" cy="${sPt.sy.toFixed(1)}" r="10.5" fill="#faf8f2" stroke="#44403c" stroke-width="0.9" />
              <text x="32" y="${(sPt.sy + 3.5).toFixed(1)}" text-anchor="middle" class="font-tour" font-size="10" font-weight="700" fill="#1c1917">${distFront}</text>
            </g>
            <g class="margin-ladder-right">
              <line x1="385" y1="${sPt.sy.toFixed(1)}" x2="468" y2="${sPt.sy.toFixed(1)}" stroke="#a8a29e" stroke-width="0.6" stroke-dasharray="2,3" />
              <text x="484" y="${(sPt.sy + 4).toFixed(1)}" text-anchor="end" class="font-tour" font-size="13.5" font-weight="700" fill="#1c1917">${distFront}</text>
              <circle cx="497" cy="${sPt.sy.toFixed(1)}" r="9" fill="#faf8f2" stroke="#44403c" stroke-width="0.85" />
              <text x="497" y="${(sPt.sy + 3).toFixed(1)}" text-anchor="middle" class="font-tour" font-size="8.5" font-weight="600" fill="#44403c">${carryAtRing}</text>
            </g>
          `;
        });
      }

      // 1B. CORRIDOR CUTOUT / CROP CLIPPING MASK (Manual Crop Border OR Auto 20-Yard Fairway Cutout)
      let cropClipDef = "";
      let cropGroupOpen = `<g class="hole-corridor-layer">`;
      const activeCutoutRing = (cropFeat && cropFeat.coords.length >= 4)
        ? cropFeat.coords
        : (showCorridorCutout && model.autoCorridorRing ? model.autoCorridorRing : null);

      if (activeCutoutRing && activeCutoutRing.length >= 4) {
        const cropPtsScreen = activeCutoutRing.slice(0, -1).map((c) => yardsToPage(model.projectToHoleYards(c)));
        const cropPolyPoints = cropPtsScreen.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(" ");
        cropClipDef = `
          <defs>
            <clipPath id="user-crop-border-clip">
              <polygon points="${cropPolyPoints}" />
            </clipPath>
          </defs>
          <polygon points="${cropPolyPoints}" fill="none" stroke="#a8a29e" stroke-width="0.7" stroke-dasharray="4,4" opacity="0.45" />
        `;
        cropGroupOpen = `<g class="hole-corridor-layer" clip-path="url(#user-crop-border-clip)">`;
      }

      svgContent += cropClipDef + cropGroupOpen;

      // 2. WATER HAZARDS
      holeData.features
        .filter((f) => f.type === "water")
        .forEach((wat) => {
          const pts = wat.coords.map((c) => yardsToPage(model.projectToHoleYards(c)));
          const d = catmullRomSplinePath(pts, true, 0.2);
          svgContent += `
            <path d="${d}" fill="#bae6fd" fill-opacity="0.55" stroke="#0284c7" stroke-width="1.3" />
            <path d="${d}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-opacity="0.3" />
          `;
        });

      // 2B. OUT OF BOUNDS (OB) LINES, STAKES & RED "O.B." CALLOUTS
      holeData.features
        .filter((f) => f.type === "ob")
        .forEach((ob) => {
          const ptsYards = ob.coords.map((c) => model.projectToHoleYards(c));
          const ptsScreen = ptsYards.map(yardsToPage);
          if (ptsScreen.length < 2) return;

          const pathD = ptsScreen
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`)
            .join(" ");

          const sideSign = ptsYards[0].x < 0 ? -1 : 1;
          let ticksSVG = "";
          for (let i = 0; i < ptsScreen.length - 1; i++) {
            const p1 = ptsScreen[i];
            const p2 = ptsScreen[i + 1];
            const segLen = Math.hypot(p2.sx - p1.sx, p2.sy - p1.sy);
            const steps = Math.max(1, Math.floor(segLen / 18));
            const dx = (p2.sx - p1.sx) / (segLen || 1);
            const dy = (p2.sy - p1.sy) / (segLen || 1);
            const nx = -dy * sideSign;
            const ny = dx * sideSign;

            for (let s = 0; s <= steps; s++) {
              const t = s / steps;
              const bx = p1.sx + (p2.sx - p1.sx) * t;
              const by = p1.sy + (p2.sy - p1.sy) * t;
              ticksSVG += `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${(bx + nx * 5.5).toFixed(1)}" y2="${(by + ny * 5.5).toFixed(1)}" stroke="#1c1917" stroke-width="1.0" />`;
              if (s % 2 === 0) {
                ticksSVG += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="1.8" fill="#ffffff" stroke="#1c1917" stroke-width="0.9" />`;
              }
            }
          }

          const midIdx = Math.floor(ptsScreen.length / 2);
          const midPt = ptsScreen[midIdx];
          const obLabelText = ob.props?.label || "O.B.";

          svgContent += `
            <g class="ob-boundary-group">
              <path d="${pathD}" fill="none" stroke="#1c1917" stroke-width="1.35" stroke-dasharray="6,3" />
              ${ticksSVG}
              <text x="${(midPt.sx + sideSign * 14).toFixed(1)}" y="${midPt.sy.toFixed(1)}" text-anchor="middle" class="font-tour" font-size="9.5" font-weight="700" fill="#b91c1c" stroke="#faf8f2" stroke-width="2.5" paint-order="stroke">${obLabelText}</text>
            </g>
          `;
        });

      // 3. CLEAN FAIRWAY CONTOUR (No random edge ticks!) & EXPLICIT SLOPE RIDGES
      holeData.features
        .filter((f) => f.type === "fairway")
        .forEach((fw) => {
          const ptsYards = fw.coords.map((c) => model.projectToHoleYards(c));
          const ptsScreen = ptsYards.map(yardsToPage);
          const d = catmullRomSplinePath(ptsScreen, true, 0.22);

          svgContent += `
            <path d="${d}" fill="#faf8f2" stroke="#1c1917" stroke-width="1.55" />
          `;
        });

      // Render intentional Fairway Slope Ridges (drawn with the "Draw Slope Ridge" tool or from Preset 1)
      if (showHachures) {
        holeData.features
          .filter((f) => f.type === "ridge")
          .forEach((rdg) => {
            const rPts = rdg.coords.map((c) => yardsToPage(model.projectToHoleYards(c)));
            const rPath = catmullRomSplinePath(rPts, false, 0.25);
            svgContent += `
              <path d="${rPath}" fill="none" stroke="#78716c" stroke-width="0.75" stroke-dasharray="3,2" />
              ${renderMoundHachuresSVG(rPts, 10, 6, false)}
            `;
          });
      }

      // 4. TREES
      holeData.features
        .filter((f) => f.type === "tree")
        .forEach((tr) => {
          const pYards = model.projectToHoleYards(tr.coords);
          const sPt = yardsToPage(pYards);
          const radPx = (tr.props?.radius || 8) * actualFwPxPerYardX;
          const frontYds = model.yardsToFrontGreen(tr.coords);
          const carryYds = model.yardsFromTee(tr.coords);
          const dx = tr.props?.dx || 0;
          const dy = tr.props?.dy || 0;
          const labelX = (pYards.x < 0 ? sPt.sx - radPx * 0.55 : sPt.sx + radPx * 0.55) + dx;

          svgContent += `
            <g class="tree-group cursor-grab" data-id="${tr.id}">
              ${renderTreeCanopySVG(sPt.sx + dx, sPt.sy + dy, radPx)}
              ${renderStackedYardageSVG(
                labelX,
                sPt.sy + 4 + dy,
                frontYds,
                carryYds > 65 ? carryYds : null,
                tr.props?.elev || 0,
                tr.props?.label || ""
              )}
            </g>
          `;
        });

      // 5. FAIRWAY BUNKERS
      holeData.features
        .filter((f) => f.type === "bunker")
        .forEach((bunk) => {
          const ptsYards = bunk.coords.map((c) => model.projectToHoleYards(c));
          const avgY = ptsYards.reduce((acc, p) => acc + p.y, 0) / ptsYards.length;
          if (avgY >= model.frontGreenXY.y - 32) return;

          const ptsScreen = ptsYards.map(yardsToPage);
          const d = catmullRomSplinePath(ptsScreen, true, 0.22);

          let backIdx = 0;
          let frontIdx = 0;
          let minY = Infinity;
          let maxY = -Infinity;

          ptsYards.forEach((p, idx) => {
            if (p.y < minY) {
              minY = p.y;
              backIdx = idx;
            }
            if (p.y > maxY) {
              maxY = p.y;
              frontIdx = idx;
            }
          });

          const backCoord = bunk.coords[backIdx];
          const frontCoord = bunk.coords[frontIdx];
          const backFrontYds = model.yardsToFrontGreen(backCoord);
          const backCarryYds = model.yardsFromTee(backCoord);
          const lipFrontYds = model.yardsToFrontGreen(frontCoord);
          const lipCarryYds = model.yardsFromTee(frontCoord);

          const backScreen = ptsScreen[backIdx];
          const frontScreen = ptsScreen[frontIdx];
          const sideSign = ptsYards[0].x < 0 ? -1 : 1;
          const dx = bunk.props?.dx || 0;
          const dy = bunk.props?.dy || 0;

          svgContent += `
            <g class="fairway-bunker cursor-grab" data-id="${bunk.id}">
              ${renderMoundHachuresSVG(ptsScreen, 5.5, 7, true)}
              <path d="${d}" fill="#f1e6b2" stroke="#1c1917" stroke-width="1.25" />
              ${renderStackedYardageSVG(backScreen.sx + sideSign * 22 + dx, backScreen.sy + 4 + dy, backFrontYds, backCarryYds)}
              ${renderStackedYardageSVG(frontScreen.sx + sideSign * 16 + dx, frontScreen.sy - 6 + dy, lipFrontYds, lipCarryYds > 270 ? lipCarryYds : null)}
            </g>
          `;
        });

      // Close fairway corridor layer BEFORE green complex so greenside bunkers & green are NEVER clipped!
      svgContent += `</g>`;

      // 6. UNIFIED DUAL-SCALE GREEN COMPLEX (Rendered at exact USGA 1:480 scale at top of hole)
      svgContent += renderGreenWithProjection(model, greenYardsToPage, "green-clip-unified", false);

      // 7. TARGETS, AIM CROSSES, SPRINKLERS & FAIRWAY PINCH RINGS
      holeData.features
        .filter((f) => f.type === "target")
        .forEach((targ) => {
          const pYards = model.projectToHoleYards(targ.coords);
          const sPt = yardsToPage(pYards);
          const frontYds = model.yardsToFrontGreen(targ.coords);
          const carryYds = model.yardsFromTee(targ.coords);
          const subtype = targ.props?.subtype || "cross_red";
          const elev = targ.props?.elev || 0;
          const label = targ.props?.label || "";
          const dx = targ.props?.dx || 0;
          const dy = targ.props?.dy || 0;

          let symbolSVG = "";
          if (subtype === "cross_red" || subtype === "cross_gold") {
            const fillCol = subtype === "cross_gold" ? "#eab308" : "#dc2626";
            symbolSVG = `
              <g transform="translate(${(sPt.sx - 13).toFixed(1)}, ${(sPt.sy - 4).toFixed(1)})">
                <line x1="-4.5" y1="0" x2="4.5" y2="0" stroke="${fillCol}" stroke-width="2" />
                <line x1="0" y1="-4.5" x2="0" y2="4.5" stroke="${fillCol}" stroke-width="2" />
              </g>
            `;
          } else if (subtype === "edge_ring") {
            const ringLet = label || "O";
            symbolSVG = `
              <g transform="translate(${sPt.sx.toFixed(1)}, ${(sPt.sy + 12).toFixed(1)})">
                <circle cx="0" cy="0" r="5.5" fill="#faf8f2" stroke="#1c1917" stroke-width="1" />
                <text x="0" y="2.8" text-anchor="middle" class="font-tour" font-size="7.5" font-weight="700" fill="#1c1917">${ringLet}</text>
              </g>
            `;
          } else {
            symbolSVG = `<circle cx="${(sPt.sx - 11).toFixed(1)}" cy="${(sPt.sy - 3).toFixed(1)}" r="2.3" fill="#b91c1c" stroke="#1c1917" stroke-width="0.6" />`;
          }

          svgContent += `
            <g class="target-point cursor-pointer" data-id="${targ.id}">
              ${symbolSVG}
              ${renderStackedYardageSVG(
            sPt.sx + dx,
            sPt.sy + dy,
            frontYds,
            carryYds > 65 ? carryYds : null,
            elev,
            subtype === "edge_ring" ? "" : label
          )}
            </g>
          `;
        });

      // 8. DUAL COMPASS ROSES (Top Green Approach Compass + Bottom Tee Box Compass, matching Photos 1 & 2!)
      const teeFeat = holeData.features.find((f) => f.type === "tee");
      const teeElev = teeFeat?.props?.elev ?? 1;
      const teeElevStr = teeElev >= 0 ? `+${teeElev}` : `${teeElev}`;

      if (viewMode === "full") {
        // Upper Green Approach Compass Rose (like Photo 1 right of green & Photo 2 left of green)
        svgContent += renderCompassRoseSVG(445, Math.min(265, syNeck - 10), model.approachBearingDeg, 0.78);
      }

      svgContent += `
        <!-- Bottom Hole Number & Yardage Title Block -->
        <g transform="translate(88, 868)">
          <text x="0" y="0" text-anchor="middle" class="font-tour" font-size="48" font-weight="700" fill="#1c1917">${holeNum}</text>
          <text x="0" y="18" text-anchor="middle" class="font-tour" font-size="15" font-weight="600" fill="#292524">${model.totalHoleYards} Yds</text>
          <text x="0" y="33" text-anchor="middle" class="font-tour" font-size="13" font-weight="500" fill="#44403c">Par ${holePar}</text>
        </g>

        <!-- Detached Tee Box Inset & Tee-to-Fairway Compass Rose -->
        <g transform="translate(395, 860)">
          <rect x="-18" y="-36" width="9" height="16" fill="none" stroke="#44403c" stroke-width="1" transform="rotate(-8)" />
          <rect x="-14" y="-14" width="9" height="16" fill="none" stroke="#44403c" stroke-width="1" transform="rotate(-5)" />
          <rect x="-11" y="8" width="10" height="18" fill="#f5f5f4" stroke="#1c1917" stroke-width="1.2" />
          <circle cx="-6" cy="17" r="2.8" fill="#b91c1c" />
          <text x="-22" y="15" text-anchor="end" class="font-tour" font-size="12" font-weight="700" fill="#1c1917">26</text>
          <text x="6" y="21" text-anchor="start" class="font-tour" font-size="11" font-weight="700" fill="#b91c1c">${teeElevStr}</text>
        </g>

        ${renderCompassRoseSVG(468, 875, model.holeBearingDeg, 1.0)}

        <rect x="8" y="8" width="524" height="924" fill="none" stroke="#d6d3d1" stroke-width="1" />
      `;

      svg.innerHTML = svgContent;
    }

    // Direct SVG Canvas Drag & Centering
    const svgEl = document.getElementById("yardage-book-svg") as SVGSVGElement | null;
    let svgDragState: {
      type: "feature" | "pan";
      featId?: string;
      startX: number;
      startY: number;
      initDx: number;
      initDy: number;
    } | null = null;

    function getSvgPoint(svgElem: SVGSVGElement, evt: PointerEvent) {
      const pt = (svgElem as any).createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const ctm = (svgElem as any).getScreenCTM();
      if (!ctm) return { x: evt.clientX, y: evt.clientY };
      return pt.matrixTransform(ctm.inverse());
    }

    if (svgEl) {
      svgEl.addEventListener("pointerdown", (e: PointerEvent) => {
        const target = e.target as HTMLElement | SVGElement;
        const targetGroup = target.closest(".target-point, .tree-group, .fairway-bunker, .greenside-bunker") as SVGElement;
        const pt = getSvgPoint(svgEl, e);

        if (targetGroup && targetGroup.dataset.id) {
          const featId = targetGroup.dataset.id;
          const feat = holeData.features.find((f: any) => String(f.id) === String(featId));
          svgDragState = {
            type: "feature",
            featId,
            startX: pt.x,
            startY: pt.y,
            initDx: feat?.props?.dx || 0,
            initDy: feat?.props?.dy || 0
          };
          try { targetGroup.setPointerCapture(e.pointerId); } catch {}
          e.stopPropagation();
        } else {
          // Canvas Pan & Center
          holeData.meta = holeData.meta || {};
          holeData.meta.pagePan = holeData.meta.pagePan || { dx: 0, dy: 0 };
          svgDragState = {
            type: "pan",
            startX: pt.x,
            startY: pt.y,
            initDx: holeData.meta.pagePan.dx || 0,
            initDy: holeData.meta.pagePan.dy || 0
          };
          try { svgEl.setPointerCapture(e.pointerId); } catch {}
        }
      });

      svgEl.addEventListener("pointermove", (e: PointerEvent) => {
        if (!svgDragState) return;
        const pt = getSvgPoint(svgEl, e);
        const deltaX = pt.x - svgDragState.startX;
        const deltaY = pt.y - svgDragState.startY;

        if (svgDragState.type === "feature" && svgDragState.featId) {
          const feat = holeData.features.find((f: any) => String(f.id) === String(svgDragState.featId));
          if (feat) {
            feat.props = feat.props || {};
            feat.props.dx = Math.round(svgDragState.initDx + deltaX);
            feat.props.dy = Math.round(svgDragState.initDy + deltaY);
            renderYardageBookSVG();
          }
        } else if (svgDragState.type === "pan") {
          holeData.meta.pagePan = holeData.meta.pagePan || { dx: 0, dy: 0 };
          holeData.meta.pagePan.dx = Math.round(svgDragState.initDx + deltaX);
          holeData.meta.pagePan.dy = Math.round(svgDragState.initDy + deltaY);
          renderYardageBookSVG();
        }
      });

      const handlePointerEnd = () => {
        if (!svgDragState) return;
        svgDragState = null;
        saveStateToLocalStorage();
      };

      svgEl.addEventListener("pointerup", handlePointerEnd);
      svgEl.addEventListener("pointercancel", handlePointerEnd);
    }

    const resetPanBtn = document.getElementById("reset-page-pan-btn");
    if (resetPanBtn) {
      resetPanBtn.addEventListener("click", () => {
        if (holeData.meta) {
          holeData.meta.pagePan = { dx: 0, dy: 0 };
        }
        holeData.features.forEach((f: any) => {
          if (f.props && (f.props.dx || f.props.dy)) {
            f.props.dx = 0;
            f.props.dy = 0;
          }
        });
        renderYardageBookSVG();
        saveStateToLocalStorage();
        showToast("Centered hole and reset page drag offsets!");
      });
    }

    /********************************************************************
     * 8. UI CONTROLS, PROJECT SAVE/LOAD, SVG EXPORT & GEOJSON MODAL
     ********************************************************************/
    document.querySelectorAll(".tool-btn").forEach((btn) => {
      btn.addEventListener("click", () => setTool(btn.dataset.tool));
    });

    document.getElementById("preset-select").addEventListener("change", (e) => {
      const val = e.target.value;
      selectedFeatureId = null;
      document.getElementById("feature-inspector").classList.add("hidden");

      if (val === "preset1") {
        holeData = buildPreset1Hole();
        syncMapFromState(true);
        showToast("Loaded Championship Par 4 (448 Yds - Dual-Scale Layout)");
      } else if (val === "preset2") {
        holeData = buildPreset2Hole();
        syncMapFromState(true);
        showToast('Loaded Risk/Reward Par 4 (399 Yds - "Big Oak" Layout)');
      } else if (val === "empty") {
        resetHoleToCurrentView();
        return;
      }

      document.getElementById("meta-hole-num").value = holeData.meta.holeNumber;
      document.getElementById("meta-hole-par").value = holeData.meta.par;
      document.getElementById("meta-green-slope-dir").value = holeData.meta.greenSlopeDir;
      document.getElementById("meta-green-slope-pct").value = holeData.meta.greenSlopePct;
    });

    ["meta-course-name", "meta-hole-num", "meta-hole-par", "meta-green-zoom", "meta-corridor-yds", "meta-green-slope-dir", "meta-green-slope-pct"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => {
        renderYardageBookSVG();
        saveStateToLocalStorage();
      });
    });

    document.querySelectorAll(".view-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        viewMode = btn.dataset.view;
        document.querySelectorAll(".view-mode-btn").forEach((b) => {
          if (b.dataset.view === viewMode) {
            b.className = "view-mode-btn bg-emerald-600 text-white text-[11px] font-semibold px-2 py-1 rounded-md transition";
          } else {
            b.className = "view-mode-btn text-slate-300 hover:text-white text-[11px] font-semibold px-2 py-1 rounded-md transition";
          }
        });
        renderYardageBookSVG();
      });
    });

    document.getElementById("toggle-corridor-btn").addEventListener("click", (e) => {
      showCorridorCutout = !showCorridorCutout;
      e.currentTarget.classList.toggle("text-fuchsia-400", showCorridorCutout);
      e.currentTarget.classList.toggle("border-fuchsia-500/50", showCorridorCutout);
      e.currentTarget.classList.toggle("text-slate-500", !showCorridorCutout);
      renderYardageBookSVG();
      showToast(showCorridorCutout ? "Auto 20-Yard Fairway Cutout enabled" : "Auto Fairway Cutout disabled");
    });

    document.getElementById("toggle-ladders-btn").addEventListener("click", (e) => {
      showLadders = !showLadders;
      e.currentTarget.classList.toggle("text-emerald-400", showLadders);
      e.currentTarget.classList.toggle("border-emerald-500/50", showLadders);
      e.currentTarget.classList.toggle("text-slate-500", !showLadders);
      renderYardageBookSVG();
      showToast(showLadders ? "Margin yardage ladders enabled" : "Margin yardage ladders hidden");
    });

    document.getElementById("toggle-hachures-btn").addEventListener("click", (e) => {
      showHachures = !showHachures;
      e.currentTarget.classList.toggle("text-emerald-400", showHachures);
      e.currentTarget.classList.toggle("border-emerald-500/50", showHachures);
      e.currentTarget.classList.toggle("text-slate-500", !showHachures);
      renderYardageBookSVG();
      showToast(showHachures ? "Bank & ridge hachures enabled" : "Hachures hidden");
    });

    // Save Full 18-Hole Course Project (.json) to Disk
    document.getElementById("save-project-btn").addEventListener("click", () => {
      saveStateToLocalStorage();
      const raw = localStorage.getItem(STORAGE_KEY) || JSON.stringify({ courseHolesStore });
      const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const cName = (document.getElementById("meta-course-name").value || "course").toLowerCase().replace(/\s+/g, "_");
      link.href = url;
      link.download = `${cName}_18hole_tourbook_project.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Saved Full 18-Hole Course Project (.json)!");
    });

    // Upload 18-Hole Course Project (.json) from Disk
    document.getElementById("upload-project-input").addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target.result;
          const parsed = JSON.parse(text);
          if (parsed.courseHolesStore) {
            localStorage.setItem(STORAGE_KEY, text);
            loadStateFromLocalStorage();
            document.getElementById("geojson-modal").classList.add("hidden");
            syncMapFromState(true);
            showToast("Loaded Full 18-Hole Course Project!");
          } else {
            document.getElementById("geojson-textarea").value = text;
            document.getElementById("apply-geojson-btn").click();
          }
        } catch (err) {
          showToast("Invalid JSON project file.");
        }
      };
      reader.readAsText(file);
    });

    document.getElementById("clear-storage-btn").addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      courseHolesStore = {};
      cachedCourseOSM = null;
      holeData = buildPreset1Hole();
      refreshHoleDropdownBadges();
      document.getElementById("geojson-modal").classList.add("hidden");
      syncMapFromState(true);
      showToast("Browser cache cleared & reset to Preset 1.");
    });

    document.getElementById("export-svg-btn").addEventListener("click", () => {
      const svgEl = document.getElementById("yardage-book-svg");
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgEl);
      if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const holeNum = document.getElementById("meta-hole-num").value || 1;
      link.href = url;
      link.download = `tour_yardage_book_hole_${holeNum}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Downloaded Print-Ready Vector SVG!");
    });

    document.getElementById("print-book-btn").addEventListener("click", () => {
      window.print();
    });

    function holeToGeoJSON() {
      return {
        type: "FeatureCollection",
        metadata: {
          courseName: document.getElementById("meta-course-name").value || "Lakeview",
          holeNumber: parseInt(document.getElementById("meta-hole-num").value, 10) || 1,
          par: parseInt(document.getElementById("meta-hole-par").value, 10) || 4,
          greenSlopeDir: parseFloat(document.getElementById("meta-green-slope-dir").value) || 215,
          greenSlopePct: parseFloat(document.getElementById("meta-green-slope-pct").value) || 2.8,
          lidarGrid: holeData.lidarGrid || null
        },
        features: holeData.features.map((f) => {
          let geomType = "Polygon";
          let coordinates = [f.coords];
          if (f.type === "tee" || f.type === "tree" || f.type === "target") {
            geomType = "Point";
            coordinates = f.coords;
          } else if (f.type === "centerline" || f.type === "ob" || f.type === "ridge") {
            geomType = "LineString";
            coordinates = f.coords;
          }
          return {
            type: "Feature",
            id: f.id,
            properties: { featureType: f.type, ...(f.props || {}) },
            geometry: { type: geomType, coordinates }
          };
        })
      };
    }

    document.getElementById("geojson-modal-btn").addEventListener("click", () => {
      const gj = holeToGeoJSON();
      document.getElementById("geojson-textarea").value = JSON.stringify(gj, null, 2);
      document.getElementById("geojson-modal").classList.remove("hidden");
    });

    document.getElementById("close-geojson-modal").addEventListener("click", () => {
      document.getElementById("geojson-modal").classList.add("hidden");
    });

    document.getElementById("copy-geojson-btn").addEventListener("click", () => {
      const ta = document.getElementById("geojson-textarea");
      ta.select();
      document.execCommand("copy");
      showToast("GeoJSON copied to clipboard!");
    });

    document.getElementById("apply-geojson-btn").addEventListener("click", () => {
      try {
        const parsed = JSON.parse(document.getElementById("geojson-textarea").value);
        if (!parsed.features || !Array.isArray(parsed.features)) throw new Error("Invalid FeatureCollection");

        const loadedFeatures = parsed.features.map((f, idx) => {
          const g = f.geometry;
          const p = f.properties || {};
          const fType = p.featureType || (g.type === "Point" ? "target" : g.type === "LineString" ? "centerline" : "fairway");
          const coords = g.type === "Polygon" ? g.coordinates[0] : g.coordinates;
          return {
            id: f.id || `custom-${idx}-${Date.now()}`,
            type: fType,
            coords,
            props: p
          };
        });

        holeData.features = loadedFeatures;
        holeData.lidarGrid = parsed.metadata?.lidarGrid || null;
        if (parsed.metadata) {
          if (parsed.metadata.courseName) document.getElementById("meta-course-name").value = parsed.metadata.courseName;
          document.getElementById("meta-hole-num").value = parsed.metadata.holeNumber || 1;
          document.getElementById("meta-hole-par").value = parsed.metadata.par || 4;
          document.getElementById("meta-green-slope-dir").value = parsed.metadata.greenSlopeDir || 215;
          document.getElementById("meta-green-slope-pct").value = parsed.metadata.greenSlopePct || 2.8;
        }

        document.getElementById("geojson-modal").classList.add("hidden");
        syncMapFromState(true);
        showToast("Custom GeoJSON loaded into Studio!");
      } catch (e) {
        showToast("Invalid GeoJSON syntax — check brackets and coordinates.");
      }
    });

    window.addEventListener("DOMContentLoaded", () => {
      lucide.createIcons();
      initFallbackMapHole();
      
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

      const restored = loadStateFromLocalStorage();
      syncMapFromState(!restored);
      if (restored) {
        showToast("Restored saved course & hole from browser storage!");
      }
    });
  

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
