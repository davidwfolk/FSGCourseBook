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

    export const GREEN_LAYOUT_VERSION = "v3_3panel_smooth";

    // Fast MD5 implementation for cacheKey consistency with Python backend
    function md5(string: string): string {
      function rotateLeft(lValue: number, iShiftBits: number) {
        return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
      }
      function addUnsigned(lX: number, lY: number) {
        const lX4 = (lX & 0x40000000);
        const lY4 = (lY & 0x40000000);
        const lX8 = (lX & 0x80000000);
        const lY8 = (lY & 0x80000000);
        const lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
        if (lX4 & lY4) return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
        if (lX4 | lY4) {
          if (lResult & 0x40000000) return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
          else return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
        } else {
          return (lResult ^ lX8 ^ lY8);
        }
      }
      function F(x: number, y: number, z: number) { return (x & y) | ((~x) & z); }
      function G(x: number, y: number, z: number) { return (x & z) | (y & (~z)); }
      function H(x: number, y: number, z: number) { return (x ^ y ^ z); }
      function I(x: number, y: number, z: number) { return (y ^ (x | (~z))); }
      function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
      }
      function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
      }
      function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
      }
      function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number) {
        a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
      }
      function convertToWordArray(str: string) {
        let lWordCount;
        const lMessageLength = str.length;
        const lNumberOfWords_temp1 = lMessageLength + 8;
        const lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
        const lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
        const lWordArray = new Array(lNumberOfWords).fill(0);
        let lBytePosition = 0;
        let lByteCount = 0;
        while (lByteCount < lMessageLength) {
          lWordCount = (lByteCount - (lByteCount % 4)) / 4;
          lBytePosition = (lByteCount % 4) * 8;
          lWordArray[lWordCount] = (lWordArray[lWordCount] | (str.charCodeAt(lByteCount) << lBytePosition));
          lByteCount++;
        }
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
        lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
        lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        return lWordArray;
      }
      function wordToHex(lValue: number) {
        let WordToHexValue = '', lByte, lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
          lByte = (lValue >>> (lCount * 8)) & 255;
          const WordToHexValue_temp = '0' + lByte.toString(16);
          WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length - 2, 2);
        }
        return WordToHexValue;
      }
      const x = convertToWordArray(string);
      let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
      const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
      const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
      const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
      const S41 = 6, S42 = 10, S43 = 15, S44 = 21;
      for (let k = 0; k < x.length; k += 16) {
        const AA = a, BB = b, CC = c, DD = d;
        a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
        d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
        c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
        b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
        a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
        d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
        c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
        b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
        a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
        d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
        c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
        b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
        a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
        d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
        c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
        b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
        a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
        d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
        c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
        b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
        a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
        d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
        c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
        b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
        a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
        d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
        c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
        b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
        a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
        d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
        c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
        b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
        a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
        d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
        c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
        b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
        a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
        d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
        c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
        b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
        a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
        d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
        c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
        b = HH(b, c, d, a, x[k + 6], S34, 0x04881D05);
        a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
        d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
        c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
        b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
        a = II(a, b, c, d, x[k + 0], S41, 0xF4292244);
        d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
        c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
        b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
        a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
        d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
        c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
        b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
        a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
        d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
        c = II(c, d, a, b, x[k + 6], S43, 0xA3014314);
        b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
        a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
        d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
        c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
        b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
        a = addUnsigned(a, AA);
        b = addUnsigned(b, BB);
        c = addUnsigned(c, CC);
        d = addUnsigned(d, DD);
      }
      return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
    }

    function computeCoordHash(coords: any): string {
      if (!coords) return "0";
      const coordsArray = coords.geometry?.coordinates || (Array.isArray(coords) ? coords : []);
      const coordStr = JSON.stringify(coordsArray);
      let coordHash = 0;
      for (let i = 0; i < coordStr.length; i++) {
        coordHash = ((coordHash << 5) - coordHash) + coordStr.charCodeAt(i);
        coordHash |= 0;
      }
      return Math.abs(coordHash).toString();
    }

    // Chaikin corner-cutting polygon smoothing
    function smoothPolygonCoords(ringCoords: number[][], refinements = 3): number[][] {
      if (!ringCoords || ringCoords.length < 3) return ringCoords;
      // Normalize: strip closing point if present and remove duplicate consecutive vertices
      const raw = [...ringCoords];
      if (raw.length > 1 && raw[0][0] === raw[raw.length - 1][0] && raw[0][1] === raw[raw.length - 1][1]) {
        raw.pop();
      }
      let pts: number[][] = [];
      for (let i = 0; i < raw.length; i++) {
        const cur = raw[i];
        const prev = pts[pts.length - 1];
        if (!prev || Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 1e-7) {
          pts.push([cur[0], cur[1]]);
        }
      }
      if (pts.length < 3) return ringCoords;
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
    let courseHolesStore = {}; // Maps holeNum (1..18) -> { meta, features, lidarGrid }
    let cachedCourseOSM = null; // Full 18-hole OSM raw cache for the active course

    let activeTool = "select";
    let selectedFeatureId = null;
    let drawingPoints = [];
    let tempDrawingLayer = null;

    let viewMode = "full"; // 'full' | 'split' | 'green' | 'usga'
    let showCorridorCutout = false;
    let showLadders = true;
    let showHachures = true;
    let showSatellite = true;
    let showArcs = true;
    let showContours = true;
    let showSlopeArrows = true;

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

    function setStatus(msg: string, isError: boolean = false) {
      const el = document.getElementById("status-message");
      if (!el) return;
      const dotClass = isError ? "bg-rose-500" : "bg-emerald-400 animate-pulse";
      el.innerHTML = `
        <span class="w-2 h-2 rounded-full ${dotClass}"></span>
        <span>${msg}</span>
      `;
    }

    // Auto-Save Current Hole & 18-Hole Course Project to localStorage
    
    function syncHoleToNeon(targetHNum?: number) {
      if (!activeNeonCourseId) return;
      clearTimeout(saveToNeonTimer);

      const hNum = targetHNum ?? (parseInt((document.getElementById("meta-hole-num") as HTMLInputElement)?.value, 10) || 1);
      const holeSnapshot = JSON.parse(JSON.stringify(courseHolesStore[hNum] || holeData));
      const modelSnapshot = window.__lastSpatialModel;

      saveToNeonTimer = setTimeout(async () => {
        try {
          const feats = holeSnapshot.features || [];
          const teeFeat = feats.find((f: any) => f.type === 'tee');
          const greenFeat = feats.find((f: any) => f.type === 'green');
          const clFeat = feats.find((f: any) => f.type === 'centerline');

          const clCoords = clFeat?.coords;
          const pivotCoord = (clCoords && Array.isArray(clCoords) && clCoords.length >= 3)
            ? clCoords[Math.floor(clCoords.length / 2)]
            : null;
          const pivotLat = pivotCoord ? pivotCoord[1] : null;
          const pivotLon = pivotCoord ? pivotCoord[0] : null;

          const teeLat = teeFeat ? teeFeat.coords[1] : (clCoords ? clCoords[0][1] : 0);
          const teeLon = teeFeat ? teeFeat.coords[0] : (clCoords ? clCoords[0][0] : 0);

          let greenLat = 0;
          let greenLon = 0;
          if (greenFeat && greenFeat.coords && greenFeat.coords.length >= 3) {
            const centroid = turf.centroid(turf.polygon([greenFeat.coords])).geometry.coordinates;
            greenLon = centroid[0];
            greenLat = centroid[1];
          }

          await apiClient.saveHole({
            course_id: activeNeonCourseId,
            hole_number: hNum,
            par: holeSnapshot.meta?.par || 4,
            yardage: modelSnapshot?.totalHoleYards || (clCoords ? Math.round(turf.length(turf.lineString(clCoords), { units: 'meters' }) * 1.0936133) : 400),
            tee_lat: teeLat,
            tee_lon: teeLon,
            pivot_lat: pivotLat,
            pivot_lon: pivotLon,
            green_lat: greenLat,
            green_lon: greenLon,
            hole_bearing: modelSnapshot?.holeBearingDeg || 0,
            approach_bearing: modelSnapshot?.approachBearingDeg || 0,
            green_polygon: greenFeat ? { type: 'Polygon', coordinates: [greenFeat.coords] } : null,
            bunkers_geojson: feats.filter((f: any) => f.type === 'bunker'),
            fairways_geojson: feats.filter((f: any) => f.type === 'fairway'),
            features: feats,
            lidar_grid: holeSnapshot.lidarGrid
          });
        } catch (e) {
          console.warn("Neon auto-save hole error:", e);
        }
      }, 700);
    }

    const saveHoleToNeon = syncHoleToNeon;

    function saveStateToLocalStorage(syncNeon = false) {
      if (syncNeon) {
        syncHoleToNeon();
      }
      try {
        const curHoleNum = parseInt((document.getElementById("meta-hole-num") as HTMLInputElement)?.value, 10) || 1;
        holeData.meta = {
          holeNumber: curHoleNum,
          par: parseInt((document.getElementById("meta-hole-par") as HTMLInputElement)?.value, 10) || 4,
          greenSlopeDir: parseFloat((document.getElementById("meta-green-slope-dir") as HTMLInputElement)?.value) || 215,
          greenSlopePct: parseFloat((document.getElementById("meta-green-slope-pct") as HTMLInputElement)?.value) || 2.8,
          courseName: (document.getElementById("meta-course-name") as HTMLInputElement)?.value || "Lakeview"
        };
        courseHolesStore[curHoleNum] = JSON.parse(JSON.stringify(holeData));

        // FIX 1: Stop the LocalStorage Memory Leak
        // Strip heavy image_base64 from all holes so localStorage stays lightweight (<50 KB)
        const sanitizedStore: Record<string, any> = {};
        for (const [key, hole] of Object.entries(courseHolesStore)) {
          if (!hole) continue;
          const clonedHole = JSON.parse(JSON.stringify(hole));
          if (clonedHole.lidarGrid?.image_base64) {
            delete clonedHole.lidarGrid.image_base64;
          }
          if (clonedHole.lidar_grid?.image_base64) {
            delete clonedHole.lidar_grid.image_base64;
          }
          sanitizedStore[key] = clonedHole;
        }

        const payload = {
          version: 3,
          activeHoleNum: curHoleNum,
          courseName: holeData.meta.courseName,
          mapCenter: [map.getCenter().lat, map.getCenter().lng],
          mapZoom: map.getZoom(),
          greenZoom: parseFloat((document.getElementById("meta-green-zoom") as HTMLInputElement)?.value) || 2.3,
          corridorYds: parseFloat((document.getElementById("meta-corridor-yds") as HTMLInputElement)?.value) || 20,
          courseHolesStore: sanitizedStore,
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

        if (parsed.courseName) {
          const elCourse = document.getElementById("meta-course-name") as HTMLInputElement | null;
          if (elCourse) elCourse.value = parsed.courseName;
        }
        if (parsed.greenZoom) {
          const elZoom = document.getElementById("meta-green-zoom") as HTMLInputElement | null;
          if (elZoom) elZoom.value = parsed.greenZoom;
        }
        if (parsed.corridorYds) {
          const elCorridor = document.getElementById("meta-corridor-yds") as HTMLInputElement | null;
          if (elCorridor) elCorridor.value = parsed.corridorYds;
        }

        if (courseHolesStore[activeNum]) {
          holeData = courseHolesStore[activeNum];
          const elNum = document.getElementById("meta-hole-num") as HTMLInputElement | null;
          if (elNum) elNum.value = String(activeNum);
          const selHole = document.getElementById("course-hole-select") as HTMLSelectElement | null;
          if (selHole) selHole.value = String(activeNum);
          const elPar = document.getElementById("meta-hole-par") as HTMLInputElement | null;
          if (elPar) elPar.value = String(holeData.meta?.par || 4);
          const elDir = document.getElementById("meta-green-slope-dir") as HTMLInputElement | null;
          if (elDir) elDir.value = String(holeData.meta?.greenSlopeDir || 215);
          const elPct = document.getElementById("meta-green-slope-pct") as HTMLInputElement | null;
          if (elPct) elPct.value = String(holeData.meta?.greenSlopePct || 2.8);
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
              vm.on("dragend", () => {
                if (feat.type === "green") {
                  holeData.lidarGrid = null;
                  invalidateGreenCache();
                }
                saveStateToLocalStorage();
              });
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

      const curHNum = parseInt((document.getElementById("meta-hole-num") as HTMLInputElement)?.value || "1", 10) || 1;
      if (courseHolesStore[curHNum]) {
        courseHolesStore[curHNum].features = JSON.parse(JSON.stringify(holeData.features));
        if (activeTool === "green") {
          courseHolesStore[curHNum].lidarGrid = null;
        }
      }
      syncHoleToNeon(curHNum);

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
    function autoPopulateFairwayDots(force = false, syncMap = true) {
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

      if (syncMap) {
        syncMapFromState(false);
      }
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

          if (chosen.isNeon && chosen.neonId) {
            // Load directly from Neon Postgres
            await loadCourseFromNeon(chosen.neonId);
          } else {
            // Check if course already exists in Neon before hitting Overpass!
            const neonCourses = await apiClient.getCourses();
            const matched = neonCourses.find((nc: any) =>
              nc.name.toLowerCase().includes(cleanCourseName.toLowerCase()) ||
              cleanCourseName.toLowerCase().includes(nc.name.toLowerCase()) ||
              (Math.abs(nc.center_lat - chosen.lat) < 0.02 && Math.abs(nc.center_lon - chosen.lon) < 0.02)
            );
            if (matched) {
              await loadCourseFromNeon(matched.id);
            } else {
              // Move map and load from Overpass
              map.setView([chosen.lat, chosen.lon], 16);
              await cacheAll18HolesFromOverpass(chosen.lat, chosen.lon, cleanCourseName);
            }
          }
        });
      });
    }

    // Load Course and all 18 Holes from Neon Postgres
    async function loadCourseFromNeon(courseId: string) {
      setStatus(`Loading course and all 18 holes from Neon Postgres...`);
      showToast(`Loading course from Neon database...`);
      let loadErr: string | null = null;
      try {
        const data = await apiClient.getCourse(courseId);
        if (!data || !data.course) {
          throw new Error("Course data not found in Neon database");
        }
        const c = data.course;
        activeNeonCourseId = c.id;
        const cleanCourseName = c.name.replace(/Golf Course|Golf Club|Country Club|GC|CC/gi, "").trim() || c.name;
        const elCourseName = document.getElementById("meta-course-name") as HTMLInputElement | null;
        if (elCourseName) elCourseName.value = cleanCourseName;

        const savedSel = document.getElementById("saved-courses-select") as HTMLSelectElement | null;
        if (savedSel) savedSel.value = c.id;

        const searchInputEl = document.getElementById("course-search-input") as HTMLInputElement | null;
        if (searchInputEl) searchInputEl.value = c.name;

        if (data.holes && data.holes.length > 0) {
          courseHolesStore = {};
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
                const gCoords = h.green_polygon?.geometry?.coordinates?.[0] || h.green_polygon?.coordinates?.[0] || (Array.isArray(h.green_polygon) ? (Array.isArray(h.green_polygon[0]) && Array.isArray(h.green_polygon[0][0]) ? h.green_polygon[0] : h.green_polygon) : null);
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

            // Enforce strictly ONE active green polygon per hole
            const greenFeats = features.filter((f: any) => f.type === "green");
            if (greenFeats.length > 1) {
              const targetLat = h.green_lat ? parseFloat(h.green_lat) : null;
              const targetLon = h.green_lon ? parseFloat(h.green_lon) : null;
              let targetPt = (targetLat !== null && targetLon !== null && !isNaN(targetLat) && !isNaN(targetLon) && targetLat !== 0)
                ? [targetLon, targetLat]
                : null;
              if (!targetPt) {
                const clFeat = features.find((f: any) => f.type === "centerline");
                if (clFeat && Array.isArray(clFeat.coords) && clFeat.coords.length > 0) {
                  targetPt = clFeat.coords[clFeat.coords.length - 1];
                }
              }

              let bestGreen = greenFeats[0];
              if (targetPt) {
                bestGreen = greenFeats.reduce((best, cur) => {
                  try {
                    const curCenter = turf.centroid(turf.polygon([cur.coords])).geometry.coordinates;
                    const bestCenter = turf.centroid(turf.polygon([best.coords])).geometry.coordinates;
                    const curDist = turf.distance(turf.point(targetPt), turf.point(curCenter));
                    const bestDist = turf.distance(turf.point(targetPt), turf.point(bestCenter));
                    return curDist < bestDist ? cur : best;
                  } catch {
                    return best;
                  }
                }, greenFeats[0]);
              }
              features = [bestGreen, ...features.filter((f: any) => f.type !== "green")];
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
          // Switch to Hole 1 and let it fit bounds directly to Hole 1's tee-to-green corridor!
          switchToHoleNumber(1, true);
          showToast(`Loaded ${data.holes.length} holes from Neon database!`);
        } else {
          // Fallback to Overpass only if Neon course has 0 holes
          await cacheAll18HolesFromOverpass(parseFloat(c.center_lat), parseFloat(c.center_lon), cleanCourseName);
        }
      } catch (err: any) {
        loadErr = err?.message || "Neon error";
        console.error("Error loading course data from Neon:", err);
        showToast("Error loading course data from Neon: " + loadErr);
      } finally {
        if (loadErr) {
          setStatus(`Error: ${loadErr}`, true);
        } else {
          setStatus("Ready");
        }
      }
    }

    // Downloads & caches all 18 holes of a course in ONE Overpass call and pre-populates courseHolesStore[1..18]
    async function cacheAll18HolesFromOverpass(lat, lon, courseName) {
      setStatus(`Downloading & caching full 18-hole OSM data for ${courseName}...`);
      showToast(`Caching all holes for ${courseName}...`);

      try {
        const queryWithTrees = `[out:json][timeout:25];(
          way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee|cartpath"](around:2000,${lat},${lon});
          relation["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|green"](around:2000,${lat},${lon});
          way["natural"~"water|wood"](around:2000,${lat},${lon});
          relation["natural"="water"](around:2000,${lat},${lon});
          way["water"](around:2000,${lat},${lon});
          way["waterway"](around:2000,${lat},${lon});
          way["highway"="path"](around:2000,${lat},${lon});
          node["natural"="tree"](around:1200,${lat},${lon});
        );out geom;`;

        let osm = await fetchOverpassWithFallback(queryWithTrees);
        if (!osm || !osm.elements || osm.elements.length === 0) {
          // Fallback query without tree nodes in case Overpass timed out
          const queryBasic = `[out:json][timeout:25];(
            way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee|cartpath"](around:2000,${lat},${lon});
            relation["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|green"](around:2000,${lat},${lon});
            way["natural"~"water|wood"](around:2000,${lat},${lon});
            relation["natural"="water"](around:2000,${lat},${lon});
            way["water"](around:2000,${lat},${lon});
            way["waterway"](around:2000,${lat},${lon});
            way["highway"="path"](around:2000,${lat},${lon});
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
        const usedGreenIds = new Set<string>();

        // If OSM has explicit golf=hole ways, build all 18 holes into courseHolesStore automatically!
        if (parsed.holes.length > 0) {
          parsed.holes.sort((a, b) => (parseInt(a.ref, 10) || 0) - (parseInt(b.ref, 10) || 0));
          parsed.holes.forEach((holeWay, idx) => {
            const hNum = parseInt(holeWay.ref, 10) || idx + 1;
            const hPar = parseInt(holeWay.par, 10) || 4;
            const builtFeatures = buildIsolatedHoleFeatures(holeWay.coords, parsed, null, usedGreenIds);
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
            usedGreenIds.add(g.id);
            const teeCoord = turf.destination(turf.point(g.center), 355 * YARD_TO_M, 180, { units: "meters" }).geometry.coordinates;
            const builtFeatures = buildIsolatedHoleFeatures([teeCoord, g.center], parsed, g, usedGreenIds);
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
      } catch (err: any) {
        console.error("Error in cacheAll18HolesFromOverpass:", err);
        showToast("Error processing OSM course geometry.");
        setStatus("Error processing OSM course geometry.", true);
      } finally {
        const statusEl = document.getElementById("status-message");
        if (statusEl && statusEl.textContent?.includes("Downloading & caching")) {
          setStatus("Ready");
        }
      }
    }

    function buildIsolatedHoleFeatures(centerlineCoords, parsedOSM, forcedGreen = null, usedGreenIds = new Set()) {
      const chosenTeeCoord = centerlineCoords[0];
      let activeGreenCenter = centerlineCoords[centerlineCoords.length - 1];
      const newFeatures = [];

      let primaryGreen = forcedGreen;
      if (!primaryGreen && parsedOSM.greens.length > 0) {
        const availableGreens = parsedOSM.greens.filter(g => !usedGreenIds.has(g.id));
        const sortedGreens = [...availableGreens].sort(
          (a, b) =>
            turf.distance(turf.point(activeGreenCenter), turf.point(a.center)) -
            turf.distance(turf.point(activeGreenCenter), turf.point(b.center))
        );
        if (sortedGreens.length > 0 && turf.distance(turf.point(activeGreenCenter), turf.point(sortedGreens[0].center), { units: "meters" }) < 95) {
          primaryGreen = sortedGreens[0];
        }
      }

      if (primaryGreen) {
        usedGreenIds.add(primaryGreen.id);
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

      // Geometry/polygon-based feature association using minimum boundary distance (120m corridor)
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

        let isMatch = false;
        if (feat.type === "water") {
          // Water matches if its shoreline is within 120m of centerline or 85m of green
          isMatch = (minEdgeDistM <= 120) || (minGreenDistM <= 85);
        } else if (feat.type === "fairway") {
          // Fairway matches if within 120m of hole centerline
          isMatch = (minEdgeDistM <= 120);
        } else if (feat.type === "bunker") {
          // Bunkers match if within 120m of centerline OR within 70m of green
          isMatch = (minEdgeDistM <= 120) || (minGreenDistM <= 70);
        } else if (feat.type === "tree") {
          // Trees match if within 120m of centerline OR within 50m of green
          isMatch = (minEdgeDistM <= 120) || (minGreenDistM <= 50);
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

      // Enforce strictly ONE active green polygon per hole
      const greenFeats = newFeatures.filter((f) => f.type === "green");
      if (greenFeats.length > 1) {
        const bestGreen = greenFeats.reduce((best, cur) => {
          try {
            const curCenter = turf.centroid(turf.polygon([cur.coords])).geometry.coordinates;
            const bestCenter = turf.centroid(turf.polygon([best.coords])).geometry.coordinates;
            const curDist = turf.distance(turf.point(activeGreenCenter), turf.point(curCenter));
            const bestDist = turf.distance(turf.point(activeGreenCenter), turf.point(bestCenter));
            return curDist < bestDist ? cur : best;
          } catch {
            return best;
          }
        }, greenFeats[0]);
        return [bestGreen, ...newFeatures.filter((f) => f.type !== "green")];
      }

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
        if (el.type === "node" && el.tags && el.tags.natural === "tree") {
          candidateFeatures.push({
            id: `osm-tree-${el.id}`,
            type: "tree",
            coords: [el.lon, el.lat],
            center: [el.lon, el.lat],
            props: { label: "", elev: 0, radius: 8, dx: 0, dy: 0 }
          });
          return;
        }

        if ((el.type === "way" || el.type === "relation") && el.tags) {
          const gType = (el.tags.golf || "").toLowerCase();
          const nType = (el.tags.natural || "").toLowerCase();
          const wType = (el.tags.water || "").toLowerCase();
          const bType = (el.tags.basin || "").toLowerCase();

          const rings: Array<{ id: string; coords: number[][] }> = [];
          if (el.type === "way") {
            let rawCoords: number[][] = [];
            if (el.geometry) {
              rawCoords = el.geometry.map((pt: any) => [pt.lon, pt.lat]);
            } else if (el.nodes) {
              rawCoords = (el.nodes || []).map((nid: any) => nodes[nid]).filter(Boolean);
            }
            if (rawCoords.length >= 2) {
              if (gType === "hole") {
                candidateHoles.push({
                  id: `osm-hole-${el.id}`,
                  coords: rawCoords,
                  ref: el.tags.ref || el.tags.name || "",
                  par: el.tags.par || el.tags["golf:par"] || "4"
                });
                return;
              }
              rings.push({ id: `osm-${gType || nType || 'poly'}-${el.id}`, coords: rawCoords });
            }
          } else if (el.type === "relation" && Array.isArray(el.members)) {
            el.members.forEach((m: any, mIdx: number) => {
              if ((m.role === "outer" || !m.role) && Array.isArray(m.geometry) && m.geometry.length >= 2) {
                rings.push({
                  id: `osm-${gType || nType || 'rel'}-${el.id}-${m.ref || mIdx}`,
                  coords: m.geometry.map((pt: any) => [pt.lon, pt.lat])
                });
              }
            });
          }

          rings.forEach((item) => {
            const rawCoords = item.coords;
            if (rawCoords.length < 3) return;
            let coords = [...rawCoords];
            if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
              coords.push([...coords[0]]);
            }
            if (coords.length < 4) return;

            try {
              const poly = turf.polygon([coords]);
              const center = turf.centroid(poly).geometry.coordinates;

              if (gType === "green") {
                candidateGreens.push({ id: item.id, type: "green", coords, center, props: { label: "" } });
              } else if (gType === "tee") {
                candidateTees.push({ id: item.id, type: "tee", coords: center, center, props: { label: "OSM Tee", elev: 0 } });
              } else if (gType === "fairway") {
                candidateFeatures.push({ id: item.id, type: "fairway", coords, center, props: { label: "" } });
              } else if (gType === "bunker" || nType === "sand") {
                candidateFeatures.push({ id: item.id, type: "bunker", coords, center, props: { label: "" } });
              } else if (gType.includes("water") || nType === "water" || Boolean(wType) || Boolean(bType)) {
                candidateFeatures.push({ id: item.id, type: "water", coords, center, props: { label: "" } });
              }
            } catch (err) {}
          });
        }
      });

      candidateHoles.sort((a, b) => (parseInt(a.ref, 10) || 99) - (parseInt(b.ref, 10) || 99));
      return { holes: candidateHoles, greens: candidateGreens, tees: candidateTees, features: candidateFeatures };
    }

    // Switch between Holes 1..18 while preserving edits in courseHolesStore
    function switchToHoleNumber(targetHoleNum: number | string, skipSave = false) {
      // Clear any pending Neon auto-save timer from previous hole immediately
      clearTimeout(saveToNeonTimer);

      // Save current hole to memory / localStorage before switching (DO NOT sync to Neon on switch!)
      if (!skipSave) {
        saveStateToLocalStorage(false);
      }

      const hNum = Math.max(1, Math.min(18, parseInt(String(targetHoleNum), 10) || 1));
      const elNum = document.getElementById("meta-hole-num") as HTMLInputElement | null;
      if (elNum) elNum.value = String(hNum);
      if (courseHoleSelect) courseHoleSelect.value = String(hNum);

      if (courseHolesStore[hNum] && courseHolesStore[hNum].features && courseHolesStore[hNum].features.length > 0) {
        holeData = JSON.parse(JSON.stringify(courseHolesStore[hNum]));
        // Enforce strictly ONE active green polygon per hole
        const greenFeats = holeData.features.filter((f: any) => f.type === "green");
        if (greenFeats.length > 1) {
          const clFeat = holeData.features.find((f: any) => f.type === "centerline");
          const targetPt = (clFeat && clFeat.coords && clFeat.coords.length > 0) ? clFeat.coords[clFeat.coords.length - 1] : null;
          let bestGreen = greenFeats[0];
          if (targetPt) {
            bestGreen = greenFeats.reduce((best, cur) => {
              try {
                const curCenter = turf.centroid(turf.polygon([cur.coords])).geometry.coordinates;
                const bestCenter = turf.centroid(turf.polygon([best.coords])).geometry.coordinates;
                const curDist = turf.distance(turf.point(targetPt), turf.point(curCenter));
                const bestDist = turf.distance(turf.point(targetPt), turf.point(bestCenter));
                return curDist < bestDist ? cur : best;
              } catch {
                return best;
              }
            }, greenFeats[0]);
          }
          holeData.features = [bestGreen, ...holeData.features.filter((f: any) => f.type !== "green")];
          courseHolesStore[hNum].features = JSON.parse(JSON.stringify(holeData.features));
        }
        const elPar = document.getElementById("meta-hole-par") as HTMLInputElement | null;
        if (elPar) elPar.value = String(holeData.meta?.par || 4);
        const elDir = document.getElementById("meta-green-slope-dir") as HTMLInputElement | null;
        if (elDir) elDir.value = String(holeData.meta?.greenSlopeDir || 215);
        const elPct = document.getElementById("meta-green-slope-pct") as HTMLInputElement | null;
        if (elPct) elPct.value = String(holeData.meta?.greenSlopePct || 2.8);

        // Auto-generate fairway layup dots if not already present
        autoPopulateFairwayDots(false, false);

        syncMapFromState(true);
        showToast(`Switched to Hole ${hNum}`);
      } else {
        // Initialize an empty slot for this hole
        const elName = document.getElementById("meta-course-name") as HTMLInputElement | null;
        holeData = {
          meta: {
            holeNumber: hNum,
            par: 4,
            greenSlopeDir: 215,
            greenSlopePct: 2.8,
            courseName: elName?.value || "Lakeview"
          },
          lidarGrid: null,
          features: []
        };
        syncMapFromState(false);
        renderSpreads();
        showToast(`Hole ${hNum} is empty`);
      }
    }

    if (courseHoleSelect) {
      courseHoleSelect.addEventListener("change", (e: any) => {
        switchToHoleNumber(parseInt(e.target.value, 10));
      });
    }

    // Pull OSM Button: If course isn't cached yet, caches entire course around view; otherwise pulls the hole in center of screen into current hole slot
    const osmImportBtn = document.getElementById("osm-import-btn");
    if (osmImportBtn) {
      osmImportBtn.addEventListener("click", async () => {
      const b = map.getBounds();
      const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
      setStatus("Querying OpenStreetMap Overpass mirrors for golf vectors...");
      showToast("Fetching OSM golf polygons & hole paths...");

      const query = `[out:json][timeout:25];(way["golf"~"hole|green|fairway|bunker|water_hazard|lateral_water_hazard|tee|cartpath"](${bbox});node["natural"="tree"](${bbox});way["natural"~"water|wood"](${bbox});relation["natural"="water"](${bbox});way["waterway"](${bbox});way["highway"="path"](${bbox}););out geom;`;
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
        holeData.features = buildIsolatedHoleFeatures(centerlineCoords, parsed, forcedGreen);
        holeData.lidarGrid = null;
        syncMapFromState(true);
        showToast(`Pulled & saved Hole ${document.getElementById("meta-hole-num").value} (${holeData.features.length} vectors)!`);
      }
      });
    }

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
    document.getElementById("lidar-fetch-btn")?.addEventListener("click", () => {
      invalidateGreenCache();
      holeData.lidarGrid = null;
      const hNum = holeData.meta?.holeNumber || 1;
      if (courseHolesStore[hNum]) {
        courseHolesStore[hNum].lidarGrid = null;
      }
      const model = computeSpatialHoleModel();
      triggerPythonGreenRender(model, true);
      renderSpreads();
      showToast(`Fetching real USGS 3DEP 1m LiDAR from Python engine...`);
    });

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
      const currentHolePar = parseInt((document.getElementById("meta-hole-par") as HTMLInputElement)?.value || "4", 10) || 4;
      let approachOriginCoord = teeCoord;
      if (currentHolePar > 3 && centerFeat && centerFeat.coords.length >= 3) {
        // Pick the penultimate node (the dogleg / approach point in the fairway)
        for (let i = centerFeat.coords.length - 2; i >= 0; i--) {
          const dToGreen = turf.distance(turf.point(centerFeat.coords[i]), turf.point(greenCentroidCoord), { units: "meters" }) * M_TO_YARD;
          if (dToGreen >= 35) {
            approachOriginCoord = centerFeat.coords[i];
            break;
          }
        }
      } else if (currentHolePar > 3 && fwFeat && fwFeat.coords.length >= 4) {
        const fwCentroid = turf.centroid(turf.polygon([fwFeat.coords])).geometry.coordinates;
        const distTeeGreen = turf.distance(turf.point(teeCoord), turf.point(greenCentroidCoord), { units: "meters" });
        const distFwGreen = turf.distance(turf.point(fwCentroid), turf.point(greenCentroidCoord), { units: "meters" });
        if (distFwGreen < distTeeGreen && distFwGreen > 30) {
          approachOriginCoord = fwCentroid;
        }
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
        holeData.features.filter((f) => f.type === "fairway" || f.type === "green" || f.type === "bunker" || f.type === "water").forEach((f) => {
          if (f.coords && f.coords.length >= 4) {
            try {
              basePolys.push(turf.polygon([f.coords]));
            } catch (e) { }
          }
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
        greenCoord: greenCentroidCoord,
        holeBearingDeg,
        approachBearingDeg,
        pivotCoord: approachOriginCoord,
        approachOriginCoord,
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

    /********************************************************************
     * 7B. DUAL-SPREAD STRACKALINE TOUR BOOK CANVAS RENDERERS (540x1512)
     ********************************************************************/
    const tileCache = new Map<string, HTMLImageElement>();
    let tilePendingRerender = false;

    function lon2tile(lon: number, zoom: number): number {
      return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
    }
    function lat2tile(lat: number, zoom: number): number {
      const rad = (lat * Math.PI) / 180;
      return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom));
    }
    function tile2lon(x: number, zoom: number): number {
      return (x / Math.pow(2, zoom)) * 360 - 180;
    }
    function tile2lat(y: number, zoom: number): number {
      const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
      return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    function getTileImage(z: number, x: number, y: number): HTMLImageElement | null {
      const key = `${z}/${y}/${x}`;
      if (tileCache.has(key)) {
        const img = tileCache.get(key)!;
        return img.complete && img.naturalWidth > 0 ? img : null;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      img.onload = () => {
        if (!tilePendingRerender) {
          tilePendingRerender = true;
          requestAnimationFrame(() => {
            tilePendingRerender = false;
            renderSpreads();
          });
        }
      };
      tileCache.set(key, img);
      return null;
    }

    function drawRotatedSatellite(
      ctx: CanvasRenderingContext2D,
      centerLon: number,
      centerLat: number,
      bearingDeg: number,
      canvasCenterX: number,
      canvasCenterY: number,
      pxPerYard: number,
      spanYardsX: number,
      spanYardsY: number
    ) {
      const z = 18;
      const latRad = (centerLat * Math.PI) / 180;
      const mPerYard = 0.9144;
      const maxDistYards = Math.hypot(spanYardsX, spanYardsY);
      const maxDistMeters = maxDistYards * mPerYard;
      const dLat = (maxDistMeters / 111320);
      const dLon = (maxDistMeters / (111320 * Math.cos(latRad)));

      const minX = lon2tile(centerLon - dLon, z);
      const maxX = lon2tile(centerLon + dLon, z);
      const minY = lat2tile(centerLat + dLat, z);
      const maxY = lat2tile(centerLat - dLat, z);

      ctx.save();
      ctx.translate(canvasCenterX, canvasCenterY);
      ctx.rotate((-bearingDeg * Math.PI) / 180);

      for (let tx = minX; tx <= maxX; tx++) {
        for (let ty = minY; ty <= maxY; ty++) {
          const img = getTileImage(z, tx, ty);
          if (img) {
            const leftLon = tile2lon(tx, z);
            const rightLon = tile2lon(tx + 1, z);
            const topLat = tile2lat(ty, z);
            const botLat = tile2lat(ty + 1, z);

            const leftYards = (leftLon - centerLon) * (Math.PI / 180) * 6378137 * Math.cos(latRad) * 1.0936133;
            const rightYards = (rightLon - centerLon) * (Math.PI / 180) * 6378137 * Math.cos(latRad) * 1.0936133;
            const topYards = (topLat - centerLat) * (Math.PI / 180) * 6378137 * 1.0936133;
            const botYards = (botLat - centerLat) * (Math.PI / 180) * 6378137 * 1.0936133;

            const x = leftYards * pxPerYard;
            const y = -topYards * pxPerYard;
            const w = (rightYards - leftYards) * pxPerYard + 0.6;
            const h = (topYards - botYards) * pxPerYard + 0.6;

            ctx.drawImage(img, x, y, w, h);
          }
        }
      }
      ctx.restore();
    }

    function drawCompassCanvas(ctx: CanvasRenderingContext2D, cx: number, cy: number, bearingDeg: number) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((-bearingDeg * Math.PI) / 180);

      // Outer ring
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.stroke();

      // North needle (Red)
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.lineTo(-4.5, 0);
      ctx.lineTo(4.5, 0);
      ctx.closePath();
      ctx.fill();

      // South needle (White)
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(0, 17);
      ctx.lineTo(-4.5, 0);
      ctx.lineTo(4.5, 0);
      ctx.closePath();
      ctx.fill();

      // Center pin
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // "N" Label
      ctx.fillStyle = "#ef4444";
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("N", 0, -20);

      ctx.restore();
    }

    function renderHoleSpread(model: any) {
      const canvas = document.getElementById("hole-spread-canvas") as HTMLCanvasElement | null;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const holeNum = (document.getElementById("meta-hole-num") as HTMLInputElement)?.value || 1;
      const holePar = (document.getElementById("meta-hole-par") as HTMLInputElement)?.value || 4;
      const courseName = (document.getElementById("meta-course-name") as HTMLInputElement)?.value || "Lakeview";
      const holeYards = model.totalHoleYards || 350;
      const greenCoord = model.greenCentroidCoord || model.greenCoord || [0, 0];
      const teeCoord = model.teeCoord || [0, 0];
      const holeBearing = model.holeBearingDeg || 0;
      const rad = (-holeBearing * Math.PI) / 180;
      const cosB = Math.cos(rad);
      const sinB = Math.sin(rad);
      const greenLatRad = (greenCoord[1] * Math.PI) / 180;

      // Project lon/lat to rotated yards relative to greenCoord:
      function toRotatedYards(lon: number, lat: number) {
        const dx = (lon - greenCoord[0]) * (Math.PI / 180) * 6378137 * Math.cos(greenLatRad) * 1.0936133;
        const dy = (lat - greenCoord[1]) * (Math.PI / 180) * 6378137 * 1.0936133;
        const x0 = dx;
        const y0 = -dy;
        const rx = x0 * cosB - y0 * sinB;
        const ry = x0 * sinB + y0 * cosB;
        return { rx, ry };
      }

      // 1. Bounding Box Must ONLY Use the Hole Centerline (Tee, Pivot if Par 4/5, Green)
      // DO NOT include fairways or bunkers when calculating the zoom scale!
      const allRx: number[] = [];
      const allRy: number[] = [];

      function collectPt(lon: number, lat: number) {
        if (typeof lon === "number" && typeof lat === "number" && !isNaN(lon) && !isNaN(lat)) {
          const pt = toRotatedYards(lon, lat);
          allRx.push(pt.rx);
          allRy.push(pt.ry);
        }
      }

      // Collect Tee and Green
      collectPt(teeCoord[0], teeCoord[1]);
      collectPt(greenCoord[0], greenCoord[1]);

      // Collect Pivot (if Par 4/5)
      const pivotPtCoord = model.pivotCoord || model.approachOriginCoord;
      if (holePar >= 4 && pivotPtCoord) {
        collectPt(pivotPtCoord[0], pivotPtCoord[1]);
      }

      // Collect Green polygon vertices
      const greenFeat = holeData.features.find((f: any) => f.type === "green");
      if (greenFeat && Array.isArray(greenFeat.coords) && greenFeat.coords.length >= 3) {
        greenFeat.coords.forEach((c: number[]) => collectPt(c[0], c[1]));
      }

      if (allRx.length === 0) {
        allRx.push(0, 0);
        allRy.push(0, holeYards || 350);
      }

      let minRotX = Math.min(...allRx);
      let maxRotX = Math.max(...allRx);
      let minRotY = Math.min(...allRy);
      let maxRotY = Math.max(...allRy);

      // Add padding: 25 yards behind Tee (+Y), 30 yards past Green (-Y), 40 yards left/right
      const minBoxX = minRotX - 40;
      const maxBoxX = maxRotX + 40;
      const minBoxY = minRotY - 30; // 30 yards past green
      const maxBoxY = maxRotY + 25; // 25 yards behind tee

      const spanX_yards = Math.max(80, maxBoxX - minBoxX);
      const spanY_yards = Math.max(100, maxBoxY - minBoxY);

      // Compute pxPerYard so every hole fills 85% of vertical page height and doglegs stay centered
      const pxPerYard = Math.min(canvas.width / spanX_yards, (canvas.height * 0.85) / spanY_yards);

      const centerRotX = (minBoxX + maxBoxX) / 2;
      const centerRotY = (minBoxY + maxBoxY) / 2;
      const pageCenterX = canvas.width / 2; // 270
      const pageCenterY = canvas.height / 2; // 756

      function projectHole(lon: number, lat: number) {
        const { rx, ry } = toRotatedYards(lon, lat);
        return {
          x: pageCenterX + (rx - centerRotX) * pxPerYard,
          y: pageCenterY + (ry - centerRotY) * pxPerYard
        };
      }

      const gPin = projectHole(greenCoord[0], greenCoord[1]);
      const teePt = projectHole(teeCoord[0], teeCoord[1]);

      // 1. Background
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (showSatellite) {
        drawRotatedSatellite(ctx, greenCoord[0], greenCoord[1], holeBearing, gPin.x, gPin.y, pxPerYard, spanX_yards + 40, spanY_yards + 40);
        ctx.fillStyle = "rgba(10, 15, 25, 0.22)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Quadratic Bezier Curve Polygon Smoother through midpoints
      function drawSmoothPolygon(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
        if (!points || points.length < 3) return;
        const pts = [...points];
        if (pts.length > 3 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 0.001) {
          pts.pop();
        }
        const n = pts.length;
        if (n < 3) return;

        const lastPt = pts[n - 1];
        const firstPt = pts[0];
        const startMidX = (lastPt.x + firstPt.x) / 2;
        const startMidY = (lastPt.y + firstPt.y) / 2;

        ctx.beginPath();
        ctx.moveTo(startMidX, startMidY);

        for (let i = 0; i < n; i++) {
          const cur = pts[i];
          const next = pts[(i + 1) % n];
          const midX = (cur.x + next.x) / 2;
          const midY = (cur.y + next.y) / 2;
          ctx.quadraticCurveTo(cur.x, cur.y, midX, midY);
        }
        ctx.closePath();
      }

      // 2. Water Hazards
      holeData.features.filter((f: any) => f.type === "water").forEach((wf: any) => {
        if (!wf.coords || wf.coords.length < 3) return;
        const pts = wf.coords.map((c: number[]) => projectHole(c[0], c[1]));
        drawSmoothPolygon(ctx, pts);
        ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
        ctx.fill();
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      });

      // 3. Fairway Filtering:
      // Only render a fairway polygon on Spread 1 if it comes within 25 yards of the hole's
      // Tee -> Pivot -> Green centerline (and on Par 3s, ignore fairways that don't intersect the corridor)
      const clFeat = holeData.features.find((f: any) => f.type === "centerline");
      const clCoords = (clFeat && clFeat.coords && clFeat.coords.length >= 2)
        ? clFeat.coords
        : (pivotPtCoord ? [teeCoord, pivotPtCoord, greenCoord] : [teeCoord, greenCoord]);
      const clLine = turf.lineString(clCoords);

      const fairwaysToDraw = holeData.features.filter((f: any) => {
        if (f.type !== "fairway" || !f.coords || f.coords.length < 3) return false;
        let minDistYards = Infinity;
        for (let i = 0; i < f.coords.length; i++) {
          const pt = turf.point(f.coords[i]);
          const dYds = turf.pointToLineDistance(pt, clLine, { units: "meters" }) * 1.0936133;
          if (dYds < minDistYards) minDistYards = dYds;
        }
        if (holePar === 3) {
          // Par 3: ignore fairways that don't intersect the corridor within 15 yards
          return minDistYards <= 15;
        }
        return minDistYards <= 25;
      });

      fairwaysToDraw.forEach((fw: any) => {
        const pts = fw.coords.map((c: number[]) => projectHole(c[0], c[1]));
        drawSmoothPolygon(ctx, pts);
        ctx.fillStyle = "rgba(225, 255, 235, 0.55)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });

      // 4. Tee Polygons & Tee Marker
      holeData.features.filter((f: any) => f.type === "tee_polygon").forEach((tp: any) => {
        if (!tp.coords || tp.coords.length < 3) return;
        const pts = tp.coords.map((c: number[]) => projectHole(c[0], c[1]));
        drawSmoothPolygon(ctx, pts);
        ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
        ctx.fill();
        ctx.strokeStyle = "#1c1917";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(teePt.x, teePt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1c1917";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 5. Bunkers
      holeData.features.filter((f: any) => f.type === "bunker").forEach((bk: any) => {
        if (!bk.coords || bk.coords.length < 3) return;
        const pts = bk.coords.map((c: number[]) => projectHole(c[0], c[1]));
        drawSmoothPolygon(ctx, pts);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#1c1917";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });

      // 6. Green Complex
      if (greenFeat && greenFeat.coords && greenFeat.coords.length >= 3) {
        const pts = greenFeat.coords.map((c: number[]) => projectHole(c[0], c[1]));
        drawSmoothPolygon(ctx, pts);
        ctx.fillStyle = "rgba(187, 247, 208, 0.65)";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }

      // Red pin center
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(gPin.x, gPin.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 7. Distance Arcs (100y, 150y, 200y, 250y) - Complete, unbroken circles stretching edge-to-edge
      if (showArcs) {
        const angleToTee = Math.atan2(teePt.y - gPin.y, teePt.x - gPin.x);
        const greenArcConfigs = [
          { dist: 100, color: "#facc15", label: "100" },
          { dist: 150, color: "#f87171", label: "150" },
          { dist: 200, color: "#ffffff", label: "200" },
          { dist: 250, color: "#60a5fa", label: "250" }
        ];

        greenArcConfigs.forEach((arc) => {
          if (arc.dist > holeYards - 20) return;
          const rPx = arc.dist * pxPerYard;

          // Complete, unbroken circle stretching edge-to-edge across the entire page
          ctx.beginPath();
          ctx.arc(gPin.x, gPin.y, rPx, 0, Math.PI * 2);
          ctx.strokeStyle = arc.color;
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // Distance callout badges placed along fairway corridor
          const angleToTee = Math.atan2(teePt.y - gPin.y, teePt.x - gPin.x);
          [-0.38, 0.38].forEach((offset) => {
            const ang = angleToTee + offset;
            const lx = gPin.x + rPx * Math.cos(ang);
            const ly = gPin.y + rPx * Math.sin(ang);
            if (lx >= 15 && lx <= canvas.width - 15 && ly >= 60 && ly <= canvas.height - 40) {
              ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
              ctx.beginPath();
              ctx.roundRect(lx - 17, ly - 9, 34, 18, 4);
              ctx.fill();
              ctx.strokeStyle = arc.color;
              ctx.lineWidth = 1.2;
              ctx.stroke();

              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 11px Inter, sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(arc.label, lx, ly);
            }
          });
        });

        // Arcs from Tee on Par 4/5s
        if (holePar >= 4) {
          const teeArcConfigs = [
            { dist: 200, color: "#ffffff", label: "200" },
            { dist: 250, color: "#60a5fa", label: "250" },
            { dist: 300, color: "#facc15", label: "300" }
          ];

          teeArcConfigs.forEach((arc) => {
            if (arc.dist > holeYards - 50) return;
            const rPx = arc.dist * pxPerYard;

            ctx.beginPath();
            ctx.arc(teePt.x, teePt.y, rPx, 0, Math.PI * 2);
            ctx.strokeStyle = arc.color;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);

            const angleToGreen = Math.atan2(gPin.y - teePt.y, gPin.x - teePt.x);
            [-0.35, 0.35].forEach((offset) => {
              const ang = angleToGreen + offset;
              const bx = teePt.x + rPx * Math.cos(ang);
              const by = teePt.y + rPx * Math.sin(ang);
              if (bx >= 15 && bx <= canvas.width - 15 && by >= 60 && by <= canvas.height - 40) {
                ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
                ctx.beginPath();
                ctx.roundRect(bx - 17, by - 9, 34, 18, 4);
                ctx.fill();
                ctx.strokeStyle = arc.color;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 11px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(arc.label, bx, by);
              }
            });
          });
        }
      }

      // 8. Centerline & 35y Elevation Circles

      ctx.beginPath();
      clCoords.forEach((c: number[], idx: number) => {
        const pt = projectHole(c[0], c[1]);
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (clFeat && clFeat.coords && clFeat.coords.length >= 2) {
        try {
          const line = turf.lineString(clFeat.coords);
          const lenM = turf.length(line, { units: "meters" });
          const totalYds = lenM * 1.0936133;
          const elevSteps = [+2, 0, -1, +1, 0, -2, 0];
          let stepIdx = 0;
          for (let yd = 120; yd < totalYds - 40; yd += 45) {
            const ptTurf = turf.along(line, (totalYds - yd) * 0.9144, { units: "meters" });
            const pt = projectHole(ptTurf.geometry.coordinates[0], ptTurf.geometry.coordinates[1]);
            const elevVal = elevSteps[stepIdx % elevSteps.length];
            stepIdx++;

            ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.fillStyle = "#38bdf8";
            ctx.font = "bold 9px 'JetBrains Mono', monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(elevVal >= 0 ? `+${elevVal}` : `${elevVal}`, pt.x, pt.y);

            // Small slope indicator arrow
            ctx.strokeStyle = "#ffffff";
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.moveTo(pt.x + 15, pt.y - 4);
            ctx.lineTo(pt.x + 15, pt.y + 4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(pt.x + 12, pt.y + 1);
            ctx.lineTo(pt.x + 15, pt.y + 6);
            ctx.lineTo(pt.x + 18, pt.y + 1);
            ctx.fill();
          }
        } catch {}
      }

      // 9. Fairway Target Markers (+25y Aim Crosses & Sprinklers)
      holeData.features.filter((f: any) => f.type === "target").forEach((t: any) => {
        if (!t.coords) return;
        const pt = projectHole(t.coords[0], t.coords[1]);
        const dx = t.props?.dx || 0;
        const dy = t.props?.dy || 0;
        const tx = pt.x + dx;
        const ty = pt.y + dy;
        const subtype = t.props?.subtype || "sprinkler";
        const frontYds = Math.round(turf.distance(turf.point(t.coords), turf.point(greenCoord), { units: "meters" }) * 1.0936133);

        if (subtype === "cross_red") {
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(tx - 6, ty); ctx.lineTo(tx + 6, ty);
          ctx.moveTo(tx, ty - 6); ctx.lineTo(tx, ty + 6);
          ctx.stroke();
        } else if (subtype === "cross_gold") {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(tx - 6, ty); ctx.lineTo(tx + 6, ty);
          ctx.moveTo(tx, ty - 6); ctx.lineTo(tx, ty + 6);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(tx, ty, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
        ctx.beginPath();
        ctx.roundRect(tx + 8, ty - 8, 30, 16, 3);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(frontYds), tx + 23, ty);
      });

      // 10. Bunker Carry Callouts
      holeData.features.filter((f: any) => f.type === "bunker").forEach((bk: any) => {
        if (!bk.coords || bk.coords.length < 3) return;
        try {
          const poly = turf.polygon([bk.coords]);
          const center = turf.centroid(poly).geometry.coordinates;
          const distToGreen = turf.distance(turf.point(center), turf.point(greenCoord), { units: "meters" }) * 1.0936133;
          if (distToGreen > 35) {
            const carry = Math.round(turf.distance(turf.point(teeCoord), turf.point(center), { units: "meters" }) * 1.0936133);
            const pt = projectHole(center[0], center[1]);

            ctx.fillStyle = "rgba(0, 0, 0, 0.88)";
            ctx.beginPath();
            ctx.roundRect(pt.x - 22, pt.y - 10, 44, 20, 4);
            ctx.fill();
            ctx.strokeStyle = "#facc15";
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10px 'JetBrains Mono', monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${carry}y`, pt.x, pt.y);
          }
        } catch {}
      });

      // 11. Specimen Trees
      holeData.features.filter((f: any) => f.type === "tree").forEach((tr: any) => {
        if (!tr.coords) return;
        const pt = projectHole(tr.coords[0], tr.coords[1]);
        const radPx = (tr.props?.radius || 8) * pxPerYard;
        ctx.fillStyle = "rgba(16, 185, 129, 0.35)";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(8, radPx), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.fillStyle = "#047857";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();

        if (tr.props?.label) {
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(tr.props.label, pt.x, pt.y + 10);
        }
      });

      // 12. Fold Line at y = 756
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(0, 756);
      ctx.lineTo(540, 756);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "9px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("FOLD LINE", 530, 752);

      // 13. Top Header Bar & Telemetry
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(courseName.toUpperCase(), 24, 40);

      ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
      ctx.beginPath();
      ctx.roundRect(380, 24, 136, 44, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(52, 211, 153, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#34d399";
      ctx.font = "bold 18px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`HOLE ${holeNum}`, 394, 45);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillText(`PAR ${holePar} • ${holeYards} YDS`, 394, 60);

      // Compass Rose at bottom corner
      drawCompassCanvas(ctx, 480, 1450, holeBearing);
    }
    // Global in-memory cache for Python FSG-Greens-Book Tour plots
    const greenImageCache = new Map<string, HTMLImageElement>();
    const pendingGreenRenderTokens = new Set<string>();
    let forceRefreshGreen = false;
    let lastGeometryAlertKey = "";

    function invalidateGreenCache(holeNumber?: number | string) {
      if (holeNumber) {
        const hStr1 = `_h${holeNumber}_`;
        const hStr2 = `hole_${holeNumber}_`;
        const hStr3 = `_${holeNumber}_`;
        for (const k of greenImageCache.keys()) {
          if (k.includes(hStr1) || k.includes(hStr2) || k.includes(hStr3)) {
            greenImageCache.delete(k);
          }
        }
      } else {
        greenImageCache.clear();
      }
      forceRefreshGreen = true;
    }

    async function triggerPythonGreenRender(model: any, force = false) {
      const holeNum = parseInt((document.getElementById("meta-hole-num") as HTMLInputElement)?.value || "1", 10) || 1;
      const holePar = parseInt((document.getElementById("meta-hole-par") as HTMLInputElement)?.value || "4", 10) || 4;
      const courseName = (document.getElementById("meta-course-name") as HTMLInputElement)?.value || "Lakeview";
      const holeYards = model.totalHoleYards || 350;
      const greenFeat = holeData.features.find((f: any) => f.type === "green");
      if (!greenFeat || !Array.isArray(greenFeat.coords) || greenFeat.coords.length < 3) return;

      const cId = (activeNeonCourseId || "default").replace(/\//g, "_").replace(/\\/g, "_");
      const appDeg = Math.round(model.approachBearingDeg || 0);
      const coordHash = computeCoordHash(greenFeat.coords);
      const cacheKey = `${cId}_${holeNum}_${GREEN_LAYOUT_VERSION}_${appDeg}_${coordHash}`;
      if (pendingGreenRenderTokens.has(cacheKey)) return;
      pendingGreenRenderTokens.add(cacheKey);

      const bunkers = holeData.features
        .filter((f: any) => f.type === "bunker" && Array.isArray(f.coords) && f.coords.length >= 3)
        .map((f: any) => f.coords);
      const water = holeData.features
        .filter((f: any) => f.type === "water" && Array.isArray(f.coords) && f.coords.length >= 3)
        .map((f: any) => f.coords);

      try {
        const res = await fetch("/api/render-green", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            course_id: cId,
            course_name: courseName,
            hole_number: holeNum,
            par: holePar,
            yardage: holeYards,
            approach_bearing: model.approachBearingDeg,
            green_coord: model.greenCentroidCoord || model.greenCoord,
            pivot_coord: model.pivotCoord || model.approachOriginCoord,
            tee_coord: model.teeCoord,
            green_polygon: greenFeat.coords,
            bunkers,
            water,
            force_refresh: force
          })
        });

        if (res.status === 400) {
          const errData = await res.json().catch(() => ({}));
          const detail = errData.detail || "Geometry Error: Ensure the green polygon is not self-intersecting.";
          console.error("Geometry Error from /api/render-green:", detail);
          if (lastGeometryAlertKey !== cacheKey) {
            lastGeometryAlertKey = cacheKey;
            alert(detail);
          }
          return;
        }

        if (!res.ok) throw new Error(`Python render HTTP ${res.status}`);
        const payload = await res.json();
        if (payload && (payload.image_base64 || payload.image_url)) {
          payload.layout_version = GREEN_LAYOUT_VERSION;
          payload.cache_key = cacheKey;

          const rawB64 = payload.image_base64;
          const dataUri = rawB64
            ? (rawB64.startsWith("data:") ? rawB64 : `data:image/png;base64,${rawB64}`)
            : null;

          // FIX 2: Cloudflare R2 Upload Pipeline
          // Heavy base64 is offloaded to Cloudflare R2 so Postgres and localStorage stay lightweight
          if (dataUri) {
            try {
              const blob = await fetch(dataUri).then(r => r.blob());
              const courseId = activeNeonCourseId || cId || "course";
              const fileName = `${courseId}_hole_${holeNum}_${Date.now()}.png`;
              const presignRes = await fetch('/api/r2-presign?filename=' + encodeURIComponent(fileName));
              if (presignRes.ok) {
                const { uploadUrl, publicUrl } = await presignRes.json();
                if (uploadUrl) {
                  const r2UploadRes = await fetch(uploadUrl, {
                    method: 'PUT',
                    body: blob,
                    headers: { 'Content-Type': 'image/png' }
                  });
                  if (r2UploadRes.ok && publicUrl) {
                    payload.image_url = publicUrl;
                    // Explicitly delete base64 so neither Neon nor LocalStorage bloat
                    delete payload.image_base64;
                  }
                }
              }
            } catch (r2Err) {
              console.warn("R2 upload error (falling back to direct display):", r2Err);
            }
          }

          holeData.lidarGrid = payload;
          if (courseHolesStore[holeNum]) {
            courseHolesStore[holeNum].lidarGrid = payload;
          }
          forceRefreshGreen = false;

          // Save this updated, lightweight hole payload to Neon via saveHoleToNeon()
          if (activeNeonCourseId) {
            saveHoleToNeon(holeNum);
          }

          // Preload and immediately paint onto canvas
          const displaySrc = payload.image_url || dataUri;
          if (displaySrc) {
            const img = new Image();
            if (!displaySrc.startsWith("data:")) {
              img.crossOrigin = "anonymous";
            }
            img.src = displaySrc;
            img.onload = () => {
              greenImageCache.set(displaySrc, img);
              if (payload.image_url) greenImageCache.set(payload.image_url, img);
              if (dataUri) greenImageCache.set(dataUri, img);
              renderGreenSpread(model);
            };
          }
        }
      } catch (err) {
        console.warn("Python render-green unavailable, using canvas fallback:", err);
      } finally {
        pendingGreenRenderTokens.delete(cacheKey);
      }
    }

    function renderGreenSpread(model: any) {
      const canvas = document.getElementById("green-spread-canvas") as HTMLCanvasElement | null;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const holeNum = parseInt((document.getElementById("meta-hole-num") as HTMLInputElement)?.value || "1", 10) || 1;
      const cId = (activeNeonCourseId || "default").replace(/\//g, "_").replace(/\\/g, "_");
      const appDeg = Math.round(model.approachBearingDeg || 0);
      const greenFeat = holeData.features.find((f: any) => f.type === "green");
      const coordHash = greenFeat && Array.isArray(greenFeat.coords) ? computeCoordHash(greenFeat.coords) : "none";
      const cacheKey = `${cId}_${holeNum}_${GREEN_LAYOUT_VERSION}_${appDeg}_${coordHash}`;

      // FIX 3: Load Greens from R2 (check image_url first, fallback to base64)
      const holeObj = holeData;
      const grid = holeObj?.lidarGrid || holeObj?.lidar_grid;
      const imageUrl = grid?.image_url;
      const imageBase64 = grid?.image_base64;
      const imageSrc = imageUrl || imageBase64;

      const isCacheValid = grid &&
        imageSrc &&
        grid.layout_version === GREEN_LAYOUT_VERSION &&
        grid.cache_key === cacheKey;

      // 0. Instant Render from Cached Python LiDAR (R2 URL or base64) if valid and layout version matches
      if (isCacheValid && !forceRefreshGreen) {
        let img = greenImageCache.get(imageSrc);
        if (!img) {
          img = new Image();
          if (!imageSrc.startsWith("data:")) {
            img.crossOrigin = "anonymous";
          }
          img.src = imageSrc;
          img.onload = () => {
            renderGreenSpread(model);
          };
          greenImageCache.set(imageSrc, img);
          if (imageUrl) greenImageCache.set(imageUrl, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, 540, 1512);
          return;
        }
      }

      // If layout_version is missing/mismatched or cache_key differs, ignore stale image and trigger Python engine
      if (!isCacheValid || forceRefreshGreen) {
        triggerPythonGreenRender(model, forceRefreshGreen);
      }

      const holePar = parseInt((document.getElementById("meta-hole-par") as HTMLInputElement)?.value || "4", 10) || 4;
      const courseName = (document.getElementById("meta-course-name") as HTMLInputElement)?.value || "Lakeview";
      const holeYards = model.totalHoleYards || 350;
      const greenCoord = model.greenCentroidCoord || model.greenCoord || [0, 0];
      const pivotCoord = model.pivotCoord || model.approachOriginCoord || model.teeCoord || [0, 0];
      const gLatRad = (greenCoord[1] * Math.PI) / 180;

      // 1. Vector from Pivot to Green Center
      const toGreenEast = (greenCoord[0] - pivotCoord[0]) * (Math.PI / 180) * 6378137 * Math.cos(gLatRad) * 1.0936133;
      const toGreenNorth = (greenCoord[1] - pivotCoord[1]) * (Math.PI / 180) * 6378137 * 1.0936133;
      const distPivotGreen = Math.hypot(toGreenEast, toGreenNorth);

      // Unit vector along approach:
      const uE = distPivotGreen > 0.001 ? toGreenEast / distPivotGreen : 0;
      const uN = distPivotGreen > 0.001 ? toGreenNorth / distPivotGreen : 1;

      // Compass bearing of approach vector (0° = North, 90° = East, 180° = South, 270° = West)
      const approachAngleDeg = ((Math.atan2(uE, uN) * 180) / Math.PI + 360) % 360;

      // Direction of true North on rotated screen:
      const northAngleScreen = Math.atan2(-uN, -uE);

      // Convert any Lon/Lat to local yards relative to green center:
      // xYd: lateral offset (positive = right of approach)
      // yYd: approach offset (positive = back of green, away from approach; negative = front of green, towards approach)
      function toGreenYards(lon: number, lat: number) {
        const e = (lon - greenCoord[0]) * (Math.PI / 180) * 6378137 * Math.cos(gLatRad) * 1.0936133;
        const n = (lat - greenCoord[1]) * (Math.PI / 180) * 6378137 * 1.0936133;
        const xYd = e * uN - n * uE;
        const yYd = e * uE + n * uN;
        return { xYd, yYd };
      }

      // Lock scale to USGA 1:480 = 10.8 px/yard
      const SCALE_1480 = 10.8;

      function toPanelScreen(lon: number, lat: number, panelCenterX: number, panelCenterY: number) {
        const { xYd, yYd } = toGreenYards(lon, lat);
        return {
          x: panelCenterX + xYd * SCALE_1480,
          y: panelCenterY - yYd * SCALE_1480,
          xYd,
          yYd
        };
      }

      // Green Polygon in local yards:
      let greenPolyYards: { x: number; y: number }[] = [];
      if (greenFeat && Array.isArray(greenFeat.coords) && greenFeat.coords.length >= 3) {
        const smoothedCoords = smoothPolygonCoords(greenFeat.coords, 3);
        greenPolyYards = smoothedCoords.map((c: number[]) => {
          const pt = toGreenYards(c[0], c[1]);
          return { x: pt.xYd, y: pt.yYd };
        });
      } else {
        for (let a = 0; a < 32; a++) {
          const ang = (a / 32) * Math.PI * 2;
          greenPolyYards.push({ x: 12.5 * Math.cos(ang), y: 14 * Math.sin(ang) });
        }
      }

      const minGreenX = Math.min(...greenPolyYards.map(p => p.x));
      const maxGreenX = Math.max(...greenPolyYards.map(p => p.x));
      const minGreenY = Math.min(...greenPolyYards.map(p => p.y));
      const maxGreenY = Math.max(...greenPolyYards.map(p => p.y));
      const greenDepthYards = Math.max(15, Math.round(maxGreenY - minGreenY));

      function isPointInGreen(xYd: number, yYd: number): boolean {
        let inside = false;
        for (let i = 0, j = greenPolyYards.length - 1; i < greenPolyYards.length; j = i++) {
          const xi = greenPolyYards[i].x, yi = greenPolyYards[i].y;
          const xj = greenPolyYards[j].x, yj = greenPolyYards[j].y;
          const intersect = ((yi > yYd) !== (yj > yYd)) &&
            (xYd < (xj - xi) * (yYd - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }

      function isPointInFringe(xYd: number, yYd: number, bufferYds = 3.5): boolean {
        if (isPointInGreen(xYd, yYd)) return false;
        let minDistSq = Infinity;
        for (let i = 0, j = greenPolyYards.length - 1; i < greenPolyYards.length; j = i++) {
          const p1 = greenPolyYards[j];
          const p2 = greenPolyYards[i];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const l2 = dx * dx + dy * dy;
          let t = l2 > 0 ? ((xYd - p1.x) * dx + (yYd - p1.y) * dy) / l2 : 0;
          t = Math.max(0, Math.min(1, t));
          const px = p1.x + t * dx;
          const py = p1.y + t * dy;
          const distSq = (xYd - px) ** 2 + (yYd - py) ** 2;
          if (distSq < minDistSq) minDistSq = distSq;
        }
        return minDistSq <= bufferYds * bufferYds;
      }

      // Elevation field & gradients:
      const slopePctInput = parseFloat((document.getElementById("meta-green-slope-pct") as HTMLInputElement)?.value) || 2.8;
      const slopeDirDeg = parseFloat((document.getElementById("meta-green-slope-dir") as HTMLInputElement)?.value) || 215;

      const fallRad = (slopeDirDeg * Math.PI) / 180;
      const fallE = Math.sin(fallRad);
      const fallN = Math.cos(fallRad);
      const fallX_yd = fallE * uN - fallN * uE;
      const fallY_yd = fallE * uE + fallN * uN;

      const baseGrad = (slopePctInput / 100.0) * 3.0; // ft/yard

      function evalElevation(xYd: number, yYd: number): number {
        const tilt = -(xYd * fallX_yd + yYd * fallY_yd) * baseGrad;
        const undulation = 0.35 * Math.sin(0.18 * xYd + 0.12 * yYd) + 0.22 * Math.cos(0.14 * xYd - 0.16 * yYd);
        return tilt + undulation;
      }

      function evalGradients(xYd: number, yYd: number) {
        const delta = 0.25; // yards
        const dz_dx_yd = (evalElevation(xYd + delta, yYd) - evalElevation(xYd - delta, yYd)) / (2 * delta);
        const dz_dy_yd = (evalElevation(xYd, yYd + delta) - evalElevation(xYd, yYd - delta)) / (2 * delta);
        const dz_dx_ft = dz_dx_yd / 3.0;
        const dz_dy_ft = dz_dy_yd / 3.0;
        const localSlopePct = Math.hypot(dz_dx_ft, dz_dy_ft) * 100;

        // Downhill vector on screen:
        // Screen X = +xYd, downhill X = -dz_dx_ft
        // Screen Y = -yYd, downhill Y = +dz_dy_ft
        const downScreenX = -dz_dx_ft;
        const downScreenY = dz_dy_ft;
        const downLen = Math.hypot(downScreenX, downScreenY) || 1e-6;

        return {
          localSlopePct,
          downScreenX: downScreenX / downLen,
          downScreenY: downScreenY / downLen,
          downAngle: Math.atan2(downScreenY, downScreenX)
        };
      }

      // Min and Max elevation across green
      let minZ = Infinity, maxZ = -Infinity;
      for (let y = Math.floor(minGreenY); y <= Math.ceil(maxGreenY); y += 1) {
        for (let x = Math.floor(minGreenX); x <= Math.ceil(maxGreenX); x += 1) {
          if (isPointInGreen(x, y)) {
            const z = evalElevation(x, y);
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
          }
        }
      }
      if (!isFinite(minZ) || !isFinite(maxZ) || maxZ - minZ < 0.2) {
        minZ = -1.5;
        maxZ = 1.5;
      }

      // 10-Color Okabe-Ito Slope Palette
      function getOkabeItoSlopeColor(s: number): string {
        if (s < 1.0) return "#56B4E9";
        if (s < 2.0) return "#0072B2";
        if (s < 3.0) return "#009E73";
        if (s < 4.0) return "#52B788";
        if (s < 5.0) return "#2D6A4F";
        if (s < 6.0) return "#E69F00";
        if (s < 7.0) return "#D55E00";
        if (s < 8.0) return "#CC3333";
        if (s < 9.0) return "#990000";
        return "#882255";
      }

      // Elevation Color: Low Blue (#3b82f6) -> Cyan (#06b6d4) -> Mint Green (#4ade80)
      function getElevationColor(t: number): string {
        t = Math.max(0, Math.min(1, t));
        let r: number, g: number, b: number;
        if (t < 0.5) {
          const u = t / 0.5;
          r = Math.round(59 + (6 - 59) * u);
          g = Math.round(130 + (182 - 130) * u);
          b = Math.round(246 + (212 - 246) * u);
        } else {
          const u = (t - 0.5) / 0.5;
          r = Math.round(6 + (74 - 6) * u);
          g = Math.round(182 + (222 - 182) * u);
          b = Math.round(212 + (128 - 212) * u);
        }
        return `rgb(${r}, ${g}, ${b})`;
      }

      // Marching Squares 0.5-ft Contour Generator
      function getContourSegments(stepYds = 1.0, contourStep = 0.5) {
        const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
        const cols = Math.ceil((maxGreenX - minGreenX + 6) / stepYds) + 1;
        const rows = Math.ceil((maxGreenY - minGreenY + 6) / stepYds) + 1;
        const originX = minGreenX - 3;
        const originY = minGreenY - 3;

        const grid: number[][] = [];
        for (let r = 0; r < rows; r++) {
          const row: number[] = [];
          const y = originY + r * stepYds;
          for (let c = 0; c < cols; c++) {
            const x = originX + c * stepYds;
            row.push(evalElevation(x, y));
          }
          grid.push(row);
        }

        const startLvl = Math.ceil(minZ / contourStep) * contourStep;
        for (let lvl = startLvl; lvl <= maxZ; lvl += contourStep) {
          for (let r = 0; r < rows - 1; r++) {
            const y0 = originY + r * stepYds;
            const y1 = y0 + stepYds;
            for (let c = 0; c < cols - 1; c++) {
              const x0 = originX + c * stepYds;
              const x1 = x0 + stepYds;

              const vBL = grid[r][c];
              const vBR = grid[r][c + 1];
              const vTR = grid[r + 1][c + 1];
              const vTL = grid[r + 1][c];

              let mask = 0;
              if (vBL >= lvl) mask |= 1;
              if (vBR >= lvl) mask |= 2;
              if (vTR >= lvl) mask |= 4;
              if (vTL >= lvl) mask |= 8;

              if (mask === 0 || mask === 15) continue;

              const interp = (v1: number, v2: number, p1: number, p2: number) => {
                if (Math.abs(v2 - v1) < 1e-6) return (p1 + p2) / 2;
                return p1 + ((lvl - v1) / (v2 - v1)) * (p2 - p1);
              };

              const pBot = { x: interp(vBL, vBR, x0, x1), y: y0 };
              const pRight = { x: x1, y: interp(vBR, vTR, y0, y1) };
              const pTop = { x: interp(vTL, vTR, x0, x1), y: y1 };
              const pLeft = { x: x0, y: interp(vBL, vTL, y0, y1) };

              switch (mask) {
                case 1: case 14:
                  segs.push({ x1: pLeft.x, y1: pLeft.y, x2: pBot.x, y2: pBot.y });
                  break;
                case 2: case 13:
                  segs.push({ x1: pBot.x, y1: pBot.y, x2: pRight.x, y2: pRight.y });
                  break;
                case 3: case 12:
                  segs.push({ x1: pLeft.x, y1: pLeft.y, x2: pRight.x, y2: pRight.y });
                  break;
                case 4: case 11:
                  segs.push({ x1: pRight.x, y1: pRight.y, x2: pTop.x, y2: pTop.y });
                  break;
                case 5:
                  segs.push({ x1: pLeft.x, y1: pLeft.y, x2: pTop.x, y2: pTop.y });
                  segs.push({ x1: pBot.x, y1: pBot.y, x2: pRight.x, y2: pRight.y });
                  break;
                case 6: case 9:
                  segs.push({ x1: pBot.x, y1: pBot.y, x2: pTop.x, y2: pTop.y });
                  break;
                case 7: case 8:
                  segs.push({ x1: pLeft.x, y1: pLeft.y, x2: pTop.x, y2: pTop.y });
                  break;
                case 10:
                  segs.push({ x1: pLeft.x, y1: pLeft.y, x2: pBot.x, y2: pBot.y });
                  segs.push({ x1: pTop.x, y1: pTop.y, x2: pRight.x, y2: pRight.y });
                  break;
              }
            }
          }
        }
        return segs;
      }

      const contourSegments = getContourSegments(1.0, 0.5);

      function drawDownhillArrow(sx: number, sy: number, downAngle: number, color: string, len: number, lineWidth: number) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(downAngle);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";

        ctx.beginPath();
        ctx.moveTo(-len / 2, 0);
        ctx.lineTo(len / 2, 0);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(len / 2 + 1.5, 0);
        ctx.lineTo(len / 2 - 3, -2.5);
        ctx.lineTo(len / 2 - 3, 2.5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }

      // Greenside Hazards
      const greensideBunkers = holeData.features.filter((f: any) => {
        if (f.type !== "bunker" || !f.coords || f.coords.length < 3) return false;
        try {
          const poly = turf.polygon([f.coords]);
          const center = turf.centroid(poly).geometry.coordinates;
          const d = turf.distance(turf.point(center), turf.point(greenCoord), { units: "meters" }) * 1.0936133;
          return d <= 45;
        } catch { return false; }
      });

      const greensideWater = holeData.features.filter((f: any) => {
        if (f.type !== "water" || !f.coords || f.coords.length < 3) return false;
        try {
          const poly = turf.polygon([f.coords]);
          const center = turf.centroid(poly).geometry.coordinates;
          const d = turf.distance(turf.point(center), turf.point(greenCoord), { units: "meters" }) * 1.0936133;
          return d <= 55;
        } catch { return false; }
      });

      function drawHazards(panelCenterX: number, panelCenterY: number, bunkerFill = "#e5dacc", bunkerStroke = "#b0b0b0") {
        greensideWater.forEach((wf: any) => {
          ctx.beginPath();
          wf.coords.forEach((c: number[], idx: number) => {
            const pt = toPanelScreen(c[0], c[1], panelCenterX, panelCenterY);
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.fillStyle = "#a0c4ff";
          ctx.fill();
          ctx.strokeStyle = "#4a80cc";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        });

        greensideBunkers.forEach((bk: any) => {
          ctx.beginPath();
          bk.coords.forEach((c: number[], idx: number) => {
            const pt = toPanelScreen(c[0], c[1], panelCenterX, panelCenterY);
            if (idx === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.fillStyle = bunkerFill;
          ctx.fill();
          ctx.strokeStyle = bunkerStroke;
          ctx.lineWidth = 1.0;
          ctx.stroke();
        });
      }

      // Clear canvas
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // =============================================================
      // PANEL 1 (y: 0 to 380px): Green Elevation Profile
      // =============================================================
      const p1CX = 270, p1CY = 190;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, 540, 380);
      ctx.clip();

      ctx.fillStyle = "#0a1120";
      ctx.fillRect(0, 0, 540, 380);

      if (showSatellite) {
        drawRotatedSatellite(ctx, greenCoord[0], greenCoord[1], approachAngleDeg, p1CX, p1CY, SCALE_1480, 50, 36);
        ctx.fillStyle = "rgba(10, 17, 32, 0.35)";
        ctx.fillRect(0, 0, 540, 380);
      }

      drawHazards(p1CX, p1CY, "#e5dacc", "#b0b0b0");

      // Clip inside green_polygon for Elevation Mesh
      ctx.save();
      ctx.beginPath();
      greenPolyYards.forEach((pt, idx) => {
        const sx = p1CX + pt.x * SCALE_1480;
        const sy = p1CY - pt.y * SCALE_1480;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.clip();

      // 1-yard cell mesh: interpolating elevation from Low Blue -> Cyan -> Mint Green
      for (let y = Math.floor(minGreenY) - 1; y <= Math.ceil(maxGreenY) + 1; y += 1) {
        for (let x = Math.floor(minGreenX) - 1; x <= Math.ceil(maxGreenX) + 1; x += 1) {
          if (isPointInGreen(x, y)) {
            const z = evalElevation(x, y);
            const t = (z - minZ) / (maxZ - minZ || 1);
            ctx.fillStyle = getElevationColor(t);
            const sx = p1CX + x * SCALE_1480;
            const sy = p1CY - y * SCALE_1480;
            ctx.fillRect(sx - 5.4, sy - 5.4, 11.2, 11.2);
          }
        }
      }

      // 0.5-ft topographic contours
      if (showContours) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 0.8;
        contourSegments.forEach(seg => {
          const s1x = p1CX + seg.x1 * SCALE_1480;
          const s1y = p1CY - seg.y1 * SCALE_1480;
          const s2x = p1CX + seg.x2 * SCALE_1480;
          const s2y = p1CY - seg.y2 * SCALE_1480;
          ctx.beginPath();
          ctx.moveTo(s1x, s1y);
          ctx.lineTo(s2x, s2y);
          ctx.stroke();
        });
      }

      // Dark-navy downhill fall-line arrows every 2.5 yards
      if (showSlopeArrows) {
        for (let y = Math.floor(minGreenY); y <= Math.ceil(maxGreenY); y += 2.5) {
          for (let x = Math.floor(minGreenX); x <= Math.ceil(maxGreenX); x += 2.5) {
            if (isPointInGreen(x, y)) {
              const { downAngle } = evalGradients(x, y);
              const sx = p1CX + x * SCALE_1480;
              const sy = p1CY - y * SCALE_1480;
              drawDownhillArrow(sx, sy, downAngle, "#1e3a8a", 8, 1.6);
            }
          }
        }
      }

      ctx.restore(); // End green clip

      // Green outline
      ctx.beginPath();
      greenPolyYards.forEach((pt, idx) => {
        const sx = p1CX + pt.x * SCALE_1480;
        const sy = p1CY - pt.y * SCALE_1480;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // Low <---> High Elevation Legend Bar at bottom-right
      const p1BarX = 385, p1BarY = 352, p1BarW = 135, p1BarH = 10;
      for (let step = 0; step < 20; step++) {
        const t = step / 19;
        ctx.fillStyle = getElevationColor(t);
        ctx.fillRect(p1BarX + (step * p1BarW) / 20, p1BarY, p1BarW / 20 + 0.5, p1BarH);
      }
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(p1BarX, p1BarY, p1BarW, p1BarH);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("LOW", p1BarX, p1BarY - 4);
      ctx.textAlign = "right";
      ctx.fillText("HIGH", p1BarX + p1BarW, p1BarY - 4);

      // Panel 1 Title
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`HOLE ${holeNum} — GREEN ELEVATION PROFILE`, 20, 28);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText('USGA 1:480 SCALE (1" = 40 FT)', 520, 28);

      // Dividing Line at y = 380
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 380); ctx.lineTo(540, 380);
      ctx.stroke();
      ctx.restore();

      // =============================================================
      // PANEL 2 (y: 380 to 760px): StrackaLine / FSG Slope % Heatmap
      // =============================================================
      const p2CX = 270, p2CY = 570;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 380, 540, 380);
      ctx.clip();

      ctx.fillStyle = "#0a1120";
      ctx.fillRect(0, 380, 540, 380);

      if (showSatellite) {
        drawRotatedSatellite(ctx, greenCoord[0], greenCoord[1], approachAngleDeg, p2CX, p2CY, SCALE_1480, 50, 36);
        ctx.fillStyle = "rgba(10, 17, 32, 0.35)";
        ctx.fillRect(0, 380, 540, 380);
      }

      drawHazards(p2CX, p2CY, "#e5dacc", "#b0b0b0");

      // Clip inside green_polygon for Okabe-Ito Heatmap
      ctx.save();
      ctx.beginPath();
      greenPolyYards.forEach((pt, idx) => {
        const sx = p2CX + pt.x * SCALE_1480;
        const sy = p2CY - pt.y * SCALE_1480;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.clip();

      // 1-yard cell mesh using 10-color Okabe-Ito slope palette
      for (let y = Math.floor(minGreenY) - 1; y <= Math.ceil(maxGreenY) + 1; y += 1) {
        for (let x = Math.floor(minGreenX) - 1; x <= Math.ceil(maxGreenX) + 1; x += 1) {
          if (isPointInGreen(x, y)) {
            const { localSlopePct } = evalGradients(x, y);
            ctx.fillStyle = getOkabeItoSlopeColor(localSlopePct);
            const sx = p2CX + x * SCALE_1480;
            const sy = p2CY - y * SCALE_1480;
            ctx.fillRect(sx - 5.4, sy - 5.4, 11.2, 11.2);
          }
        }
      }

      // Crisp 0.5-ft white contour lines (#ffffff, 1px)
      if (showContours) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.0;
        contourSegments.forEach(seg => {
          const s1x = p2CX + seg.x1 * SCALE_1480;
          const s1y = p2CY - seg.y1 * SCALE_1480;
          const s2x = p2CX + seg.x2 * SCALE_1480;
          const s2y = p2CY - seg.y2 * SCALE_1480;
          ctx.beginPath();
          ctx.moveTo(s1x, s1y);
          ctx.lineTo(s2x, s2y);
          ctx.stroke();
        });
      }

      ctx.restore(); // End green clip

      // Bold white downhill break arrows every 2.5 yards extending 3.5y into fringe
      if (showSlopeArrows) {
        for (let y = Math.floor(minGreenY - 4); y <= Math.ceil(maxGreenY + 4); y += 2.5) {
          for (let x = Math.floor(minGreenX - 4); x <= Math.ceil(maxGreenX + 4); x += 2.5) {
            const inGreen = isPointInGreen(x, y);
            const inFringe = !inGreen && isPointInFringe(x, y, 3.5);
            if (inGreen || inFringe) {
              const { downAngle } = evalGradients(x, y);
              const sx = p2CX + x * SCALE_1480;
              const sy = p2CY - y * SCALE_1480;
              ctx.save();
              if (inFringe) ctx.globalAlpha = 0.5;
              drawDownhillArrow(sx, sy, downAngle, "#ffffff", 8.5, 1.8);
              ctx.restore();
            }
          }
        }
      }

      // Green outline
      ctx.beginPath();
      greenPolyYards.forEach((pt, idx) => {
        const sx = p2CX + pt.x * SCALE_1480;
        const sy = p2CY - pt.y * SCALE_1480;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // 10-Color Okabe-Ito Legend Bar at bottom of Panel 2
      const okabeColors = ['#56B4E9', '#0072B2', '#009E73', '#52B788', '#2D6A4F', '#E69F00', '#D55E00', '#CC3333', '#990000', '#882255'];
      const okabeLabels = ['0-1%', '1-2%', '2-3%', '3-4%', '4-5%', '5-6%', '6-7%', '7-8%', '8-9%', '9%+'];
      const legCellW = 46;
      const legStartX = (540 - 10 * legCellW) / 2;
      const legY = 728;

      okabeColors.forEach((col, idx) => {
        const bx = legStartX + idx * legCellW;
        ctx.fillStyle = col;
        ctx.fillRect(bx, legY, legCellW, 10);
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, legY, legCellW, 10);

        ctx.fillStyle = "#cbd5e1";
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(okabeLabels[idx], bx + legCellW / 2, legY + 20);
      });

      // Panel 2 Title & Depth Badge
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`HOLE ${holeNum} - FSG SLOPE HEATMAP`, 20, 408);

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.beginPath();
      ctx.roundRect(410, 394, 110, 28, 6);
      ctx.fill();
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`DEPTH: ${greenDepthYards} YDS`, 465, 412);

      // Dividing Line at y = 760
      ctx.strokeStyle = "#5c805c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 760); ctx.lineTo(540, 760);
      ctx.stroke();
      ctx.restore();

      // =============================================================
      // PANEL 3 (y: 760 to 1512px): Authentic FSG-Greens-Book USGA 1:480
      // =============================================================
      const p3CX = 270, p3CY = 1010;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 760, 540, 752);
      ctx.clip();

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 760, 540, 752);

      // Greenside Hazards in Panel 3
      drawHazards(p3CX, p3CY, "#e5dacc", "#b0b0b0");

      // 1.2m dashed fringe collar (#777777)
      let fringePolyCoords: number[][] = [];
      if (greenFeat && Array.isArray(greenFeat.coords) && greenFeat.coords.length >= 4) {
        try {
          const gPolyTurf = turf.polygon([greenFeat.coords]);
          const fPolyTurf = turf.buffer(gPolyTurf, 1.2, { units: "meters" });
          if (fPolyTurf && fPolyTurf.geometry && fPolyTurf.geometry.coordinates) {
            fringePolyCoords = fPolyTurf.geometry.coordinates[0];
          }
        } catch {}
      }

      if (fringePolyCoords.length >= 3) {
        ctx.beginPath();
        fringePolyCoords.forEach((c: number[], idx: number) => {
          const pt = toPanelScreen(c[0], c[1], p3CX, p3CY);
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#777777";
        ctx.lineWidth = 1.0;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Green Surface (#ffffff fill, #3a8c54 2.5px stroke)
      ctx.beginPath();
      greenPolyYards.forEach((pt, idx) => {
        const sx = p3CX + pt.x * SCALE_1480;
        const sy = p3CY - pt.y * SCALE_1480;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#3a8c54";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Clip inside green_polygon for Grid, Contours, and Arrows
      ctx.save();
      ctx.beginPath();
      greenPolyYards.forEach((pt, idx) => {
        const sx = p3CX + pt.x * SCALE_1480;
        const sy = p3CY - pt.y * SCALE_1480;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.clip();

      // 1. 1-yard faint grid (#f0f0f0) & 5-yard crisp grid (#d5d5d5)
      const startYdY = Math.floor(minGreenY) - 5;
      const endYdY = Math.ceil(maxGreenY) + 5;
      const startYdX = Math.floor(minGreenX) - 5;
      const endYdX = Math.ceil(maxGreenX) + 5;

      ctx.strokeStyle = "#f0f0f0";
      ctx.lineWidth = 0.5;
      for (let y = startYdY; y <= endYdY; y += 1) {
        const sy = p3CY - y * SCALE_1480;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(540, sy); ctx.stroke();
      }
      for (let x = startYdX; x <= endYdX; x += 1) {
        const sx = p3CX + x * SCALE_1480;
        ctx.beginPath(); ctx.moveTo(sx, 760); ctx.lineTo(sx, 1260); ctx.stroke();
      }

      ctx.strokeStyle = "#d5d5d5";
      ctx.lineWidth = 0.8;
      for (let y = Math.floor(minGreenY / 5) * 5; y <= endYdY; y += 5) {
        const sy = p3CY - y * SCALE_1480;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(540, sy); ctx.stroke();
      }
      for (let x = Math.floor(minGreenX / 5) * 5; x <= endYdX; x += 5) {
        const sx = p3CX + x * SCALE_1480;
        ctx.beginPath(); ctx.moveTo(sx, 760); ctx.lineTo(sx, 1260); ctx.stroke();
      }

      // 2. 0.5-ft contour lines (#666666, 0.8px)
      if (showContours) {
        ctx.strokeStyle = "#666666";
        ctx.lineWidth = 0.8;
        contourSegments.forEach(seg => {
          const s1x = p3CX + seg.x1 * SCALE_1480;
          const s1y = p3CY - seg.y1 * SCALE_1480;
          const s2x = p3CX + seg.x2 * SCALE_1480;
          const s2y = p3CY - seg.y2 * SCALE_1480;
          ctx.beginPath();
          ctx.moveTo(s1x, s1y);
          ctx.lineTo(s2x, s2y);
          ctx.stroke();
        });
      }

      ctx.restore(); // End green clip for grid and contours

      // 3. Dense 2-yard stride downhill fall-line arrows + slope % labels every 8 yards
      // Extends at least 3.5 yards into fringe area with opacity 0.5
      if (showSlopeArrows) {
        for (let y = Math.floor(minGreenY - 4); y <= Math.ceil(maxGreenY + 4); y += 2) {
          for (let x = Math.floor(minGreenX - 4); x <= Math.ceil(maxGreenX + 4); x += 2) {
            const inGreen = isPointInGreen(x, y);
            const inFringe = !inGreen && isPointInFringe(x, y, 3.5);
            if (inGreen || inFringe) {
              const { localSlopePct, downAngle, downScreenX, downScreenY } = evalGradients(x, y);
              const color = getOkabeItoSlopeColor(localSlopePct);
              const sx = p3CX + x * SCALE_1480;
              const sy = p3CY - y * SCALE_1480;
              ctx.save();
              if (inFringe) ctx.globalAlpha = 0.5;
              drawDownhillArrow(sx, sy, downAngle, color, 8, 1.4);
              ctx.restore();

              // Numeric slope % label every 8 yards inside green
              if (inGreen && Math.abs(x) % 8 < 1.2 && Math.abs(y) % 8 < 1.2) {
                ctx.fillStyle = "#111111";
                ctx.font = "bold 7px 'JetBrains Mono', monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(localSlopePct.toFixed(1), sx - downScreenX * 6, sy - downScreenY * 6);
              }
            }
          }
        }
      }

      // Perimeter Depth Labels along every 5-yard line from front edge
      ctx.fillStyle = "#333333";
      ctx.font = "bold 8.5px 'JetBrains Mono', monospace";
      ctx.textBaseline = "middle";

      for (let d = 5; d <= greenDepthYards; d += 5) {
        const yTarget = minGreenY + d;
        const xIntersects: number[] = [];

        for (let i = 0, j = greenPolyYards.length - 1; i < greenPolyYards.length; j = i++) {
          const p1 = greenPolyYards[j];
          const p2 = greenPolyYards[i];
          if ((p1.y <= yTarget && p2.y > yTarget) || (p2.y <= yTarget && p1.y > yTarget)) {
            const t = (yTarget - p1.y) / (p2.y - p1.y);
            xIntersects.push(p1.x + t * (p2.x - p1.x));
          }
        }

        if (xIntersects.length >= 2) {
          const minIX = Math.min(...xIntersects);
          const maxIX = Math.max(...xIntersects);
          const sy = p3CY - yTarget * SCALE_1480;
          const sMinX = p3CX + minIX * SCALE_1480;
          const sMaxX = p3CX + maxIX * SCALE_1480;

          ctx.textAlign = "right";
          ctx.fillText(String(d), sMinX - 8, sy);

          ctx.textAlign = "left";
          ctx.fillText(String(d), sMaxX + 8, sy);
        }
      }

      // Compass & Course Name (Top Left of Panel 3)
      const compX = 50;
      const compY = 805;
      ctx.save();
      ctx.translate(compX, compY);
      ctx.rotate(northAngleScreen + Math.PI / 2);

      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(-6, 6);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fillStyle = "#1e293b";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fillStyle = "#94a3b8";
      ctx.fill();

      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("N", 0, -16);
      ctx.restore();

      const cleanCourse = courseName.toUpperCase().replace(" GOLF COURSE", "").replace(" GOLF CLUB", "");
      ctx.fillStyle = "#111111";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(cleanCourse, compX + 24, compY - 7);
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.fillStyle = "#64748b";
      ctx.fillText("GOLF CLUB", compX + 24, compY + 7);

      // Total Green Depth (Top Right of Panel 3)
      ctx.fillStyle = "#222222";
      ctx.font = "bold 28px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(String(greenDepthYards), 500, 805);

      ctx.fillStyle = "#777777";
      ctx.font = "bold 8px Inter, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText("YDS DEPTH", 500, 808);

      // Below y = 1260: Divider, Notes, Metadata, and Badges
      ctx.strokeStyle = "#5c805c";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(0, 1260); ctx.lineTo(540, 1260);
      ctx.stroke();

      ctx.fillStyle = "#888888";
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("NOTES", 40, 1288);

      ctx.fillStyle = "#222222";
      ctx.font = "bold 18px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`HOLE ${holeNum}`, 500, 1288);

      ctx.fillStyle = "#27ae60";
      ctx.font = "bold 11px Inter, sans-serif";
      ctx.fillText(`PAR ${holePar}  |  ${holeYards} YDS`, 500, 1306);

      // Ruled Horizontal Lines
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1.0;
      [1326, 1350, 1374, 1398, 1422, 1446].forEach((ly) => {
        ctx.beginPath();
        ctx.moveTo(40, ly);
        ctx.lineTo(500, ly);
        ctx.stroke();
      });

      // Bottom Circle Badges
      // Left Badge: PAR & YDS
      ctx.beginPath();
      ctx.arc(85, 1475, 23, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#5c805c";
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = "#222222";
      ctx.font = "bold 9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`PAR ${holePar}`, 85, 1470);

      ctx.fillStyle = "#27ae60";
      ctx.font = "bold 8px Inter, sans-serif";
      ctx.fillText(`${holeYards} YDS`, 85, 1482);

      // Right Badge: Hole Number
      ctx.beginPath();
      ctx.arc(455, 1475, 23, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#5c805c";
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.fillStyle = "#222222";
      ctx.font = "bold 18px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(holeNum), 455, 1475);

      // Outer Border around entire Panel 3 / Canvas
      ctx.strokeStyle = "#5c805c";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 536, 1508);

      ctx.restore();
    }

    function renderSpreads() {
      const model = computeSpatialHoleModel();
      window.__lastSpatialModel = model;
      renderHoleSpread(model);
      renderGreenSpread(model);

      const pillYds = document.getElementById("spread-yardage-pill");
      if (pillYds) pillYds.textContent = `${model.totalHoleYards}y`;
      const pillBrg = document.getElementById("spread-bearing-pill");
      if (pillBrg) pillBrg.textContent = `${Math.round(model.holeBearingDeg)}° Brg`;

      const telemBrg = document.getElementById("telemetry-bearing");
      if (telemBrg) telemBrg.textContent = `${Math.round(model.holeBearingDeg)}°`;
      const telemApp = document.getElementById("telemetry-app-bearing");
      if (telemApp) telemApp.textContent = `${Math.round(model.approachBearingDeg)}°`;
      const telemLen = document.getElementById("telemetry-length");
      if (telemLen) telemLen.textContent = `${model.totalHoleYards}y`;
      const telemDep = document.getElementById("telemetry-depth");
      if (telemDep) telemDep.textContent = `${model.greenDepthYards}y`;
    }

    function renderYardageBookSVG() {
      const model = computeSpatialHoleModel();
      renderSpreads();

      const svg = document.getElementById("yardage-book-svg");
      if (!svg) return;

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

      // Points specifically used to determine the fairway landing corridor bounds
      // (Excludes wide water bodies and distant background trees so they don't crush the fairway!)
      const corridorYardsPts: { x: number; y: number }[] = [];
      if (cropFeat && cropFeat.coords.length >= 4) {
        cropFeat.coords.forEach((c) => corridorYardsPts.push(model.projectToHoleYards(c)));
      } else {
        holeData.features.forEach((f) => {
          if (f.type === "fairway") {
            if (Array.isArray(f.coords[0])) {
              f.coords.forEach((c) => corridorYardsPts.push(model.projectToHoleYards(c)));
            }
          } else if (f.type === "bunker") {
            // Only include fairway bunkers (not greenside)
            const c0 = Array.isArray(f.coords[0]) ? f.coords[0] : f.coords;
            if (model.yardsToFrontGreen(c0) > 28) {
              if (Array.isArray(f.coords[0])) {
                f.coords.forEach((c) => corridorYardsPts.push(model.projectToHoleYards(c)));
              }
            }
          } else if (f.type === "centerline") {
            if (Array.isArray(f.coords)) {
              f.coords.forEach((c) => corridorYardsPts.push(model.projectToHoleYards(c)));
            }
          }
        });
      }

      const minYData = corridorYardsPts.length ? Math.min(...corridorYardsPts.map((p) => p.y)) : 170;

      // In Tour Yardage Books (Photos 1 & 2), the Landing Zone begins ~190-210y out from the green,
      // or at the start of the fairway, so the fairway fills the lower ~65% of the card!
      const targetLandingMinY = Math.max(minYData - 8, model.frontGreenXY.y - 215);
      const plotMinY = cropFeat
        ? (corridorYardsPts.length ? Math.min(...corridorYardsPts.map(p => p.y)) : minYData)
        : Math.max(15, Math.min(targetLandingMinY, model.frontGreenXY.y - 130));

      const yNeck = model.frontGreenXY.y - 6; // Transition datum 6 yards short of front green edge
      const greenSpanY = Math.max(28, model.backGreenXY.y + 6 - yNeck);
      const fwSpanY = Math.max(75, yNeck - plotMinY);

      const topOffset = viewMode === "split" ? 285 : 26;

      // Base fairway scale & USGA 1:480 Green Scale
      const usga1480GreenScale = 7.2; // 1 yard = 7.2px (3/8" per 5 yds at 96 DPI)
      const greenPxPerYard = viewMode === "split"
        ? Math.min(390 / 80, 600 / fwSpanY)
        : Math.min(7.6, Math.max(5.5, usga1480GreenScale * (greenZoomRatio / 2.3)));

      // Screen Y position of the Neck transition (gives green top ~26-28% of page)
      const syNeck = viewMode === "split"
        ? topOffset + greenSpanY * (600 / fwSpanY)
        : Math.min(270, Math.max(210, topOffset + greenSpanY * greenPxPerYard));

      // Landing corridor lateral span: only points within the active landing zone
      const landingPts = corridorYardsPts.filter((p) => p.y >= plotMinY - 12 && p.y <= yNeck + 5);
      const minLandingX = landingPts.length ? Math.min(...landingPts.map((p) => p.x)) : -24;
      const maxLandingX = landingPts.length ? Math.max(...landingPts.map((p) => p.x)) : 24;
      const midLandingX = (minLandingX + maxLandingX) / 2;
      const midX = cropFeat ? midLandingX : Math.max(-16, Math.min(16, midLandingX));
      const spanRaw = Math.max(Math.abs(minLandingX - midX), Math.abs(maxLandingX - midX)) + 14;
      const halfSpanX = cropFeat ? Math.max(20, (maxLandingX - minLandingX) / 2 + 2) : Math.min(48, Math.max(30, spanRaw));

      // Fairway vertical compression (scrunches fairway to fill from syNeck down to 845px, right above title block!)
      const availableFwHeight = 845 - syNeck;
      const actualFwPxPerYardY = Math.max(0.85, availableFwHeight / fwSpanY);
      // Fairway lateral scale (fills page width ~370px comfortably, matching Photos 1 & 2)
      const actualFwPxPerYardX = Math.min(5.2, Math.max(3.8, 370 / (halfSpanX * 2)));
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

        // Smooth hermite blend factor across the approach collar [-20, 0]
        const t = Math.max(0, Math.min(1, (dyFromNeck + 20) / 20));
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

    ["meta-course-name", "meta-hole-num", "meta-hole-par", "meta-green-zoom", "meta-corridor-yds", "meta-green-slope-dir", "meta-green-slope-pct"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("input", () => {
          renderYardageBookSVG();
          renderSpreads();
          saveStateToLocalStorage();
        });
      }
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

    const toggleCorridorBtn = document.getElementById("toggle-corridor-btn");
    if (toggleCorridorBtn) {
      toggleCorridorBtn.addEventListener("click", (e) => {
        showCorridorCutout = !showCorridorCutout;
        e.currentTarget.classList.toggle("text-fuchsia-400", showCorridorCutout);
        e.currentTarget.classList.toggle("border-fuchsia-500/50", showCorridorCutout);
        e.currentTarget.classList.toggle("text-slate-500", !showCorridorCutout);
        renderYardageBookSVG();
        showToast(showCorridorCutout ? "Auto 20-Yard Fairway Cutout enabled" : "Auto Fairway Cutout disabled");
      });
    }

    const toggleLaddersBtn = document.getElementById("toggle-ladders-btn");
    if (toggleLaddersBtn) {
      toggleLaddersBtn.addEventListener("click", (e) => {
        showLadders = !showLadders;
        e.currentTarget.classList.toggle("text-emerald-400", showLadders);
        e.currentTarget.classList.toggle("border-emerald-500/50", showLadders);
        e.currentTarget.classList.toggle("text-slate-500", !showLadders);
        renderYardageBookSVG();
        showToast(showLadders ? "Margin yardage ladders enabled" : "Margin yardage ladders hidden");
      });
    }

    const toggleHachuresBtn = document.getElementById("toggle-hachures-btn");
    if (toggleHachuresBtn) {
      toggleHachuresBtn.addEventListener("click", (e) => {
        showHachures = !showHachures;
        e.currentTarget.classList.toggle("text-emerald-400", showHachures);
        e.currentTarget.classList.toggle("border-emerald-500/50", showHachures);
        e.currentTarget.classList.toggle("text-slate-500", !showHachures);
        renderYardageBookSVG();
        showToast(showHachures ? "Bank & ridge hachures enabled" : "Hachures hidden");
      });
    }

    // New 2-Spread Layer Toggles
    const toggleSatBtn = document.getElementById("toggle-satellite-btn");
    if (toggleSatBtn) {
      toggleSatBtn.addEventListener("click", () => {
        showSatellite = !showSatellite;
        toggleSatBtn.classList.toggle("text-emerald-400", showSatellite);
        toggleSatBtn.classList.toggle("text-slate-500", !showSatellite);
        renderSpreads();
        showToast(showSatellite ? "Satellite background enabled" : "Satellite background hidden");
      });
    }

    const toggleArcsBtn = document.getElementById("toggle-arcs-btn");
    if (toggleArcsBtn) {
      toggleArcsBtn.addEventListener("click", () => {
        showArcs = !showArcs;
        toggleArcsBtn.classList.toggle("text-amber-400", showArcs);
        toggleArcsBtn.classList.toggle("text-slate-500", !showArcs);
        renderSpreads();
        showToast(showArcs ? "Distance arcs enabled" : "Distance arcs hidden");
      });
    }

    const toggleContoursBtn = document.getElementById("toggle-contours-btn");
    if (toggleContoursBtn) {
      toggleContoursBtn.addEventListener("click", () => {
        showContours = !showContours;
        toggleContoursBtn.classList.toggle("text-sky-400", showContours);
        toggleContoursBtn.classList.toggle("text-slate-500", !showContours);
        renderSpreads();
        showToast(showContours ? "Topographic contours enabled" : "Contours hidden");
      });
    }

    const toggleArrowsBtn = document.getElementById("toggle-arrows-btn");
    if (toggleArrowsBtn) {
      toggleArrowsBtn.addEventListener("click", () => {
        showSlopeArrows = !showSlopeArrows;
        toggleArrowsBtn.classList.toggle("text-teal-300", showSlopeArrows);
        toggleArrowsBtn.classList.toggle("text-slate-500", !showSlopeArrows);
        renderSpreads();
        showToast(showSlopeArrows ? "Slope break arrows enabled" : "Slope arrows hidden");
      });
    }

    async function loadSavedCoursesDropdown() {
      const sel = document.getElementById("saved-courses-select") as HTMLSelectElement | null;
      try {
        const courses = await apiClient.getCourses();
        if (sel) {
          if (!courses || courses.length === 0) {
            sel.innerHTML = '<option value="">No Saved Courses in Neon</option>';
          } else {
            sel.innerHTML = '<option value="">Saved Courses (Neon)...</option>' + courses.map((c: any) => {
              const loc = [c.city, c.state].filter(Boolean).join(", ");
              const holesBadge = c.holes_count ? ` (${c.holes_count}h)` : "";
              return `<option value="${c.id}">${c.name}${loc ? " — " + loc : ""}${holesBadge}</option>`;
            }).join("");
          }
        }
        return courses || [];
      } catch (err) {
        console.warn("loadSavedCoursesDropdown error:", err);
        return [];
      }
    }

    const savedCoursesSel = document.getElementById("saved-courses-select");
    if (savedCoursesSel) {
      savedCoursesSel.addEventListener("change", async (e: any) => {
        const cId = e.target.value;
        if (cId) {
          await loadCourseFromNeon(cId);
        }
      });
    }

    const resyncOsmBtn = document.getElementById("resync-osm-btn");
    if (resyncOsmBtn) {
      resyncOsmBtn.addEventListener("click", async () => {
        if (!activeNeonCourseId) {
          showToast("Select a course first to re-sync from OSM.");
          return;
        }
        showToast("Re-syncing 18 holes from OpenStreetMap (Soft Merge)...");
        setStatus("Fetching course geometry and updating fairways/bunkers...");
        let syncError: string | null = null;
        try {
          const res = await apiClient.getCourse(activeNeonCourseId, true, false);
          if (res && res.course) {
            courseHolesStore = {};
            await loadCourseFromNeon(activeNeonCourseId);
            showToast(`Soft Merge complete for ${res.course.name}!`);
          } else {
            showToast("OSM re-sync completed.");
          }
        } catch (err: any) {
          syncError = err?.message || "Overpass error";
          console.error("OSM re-sync failed:", err);
          showToast("OSM re-sync failed: " + syncError);
        } finally {
          if (syncError) {
            setStatus(`Error: ${syncError}`, true);
          } else {
            setStatus("Ready");
          }
        }
      });
    }

    const hardResetOsmBtn = document.getElementById("hard-reset-osm-btn");
    if (hardResetOsmBtn) {
      hardResetOsmBtn.addEventListener("click", async () => {
        if (!activeNeonCourseId) {
          showToast("Select a course first to hard reset from OSM.");
          return;
        }
        const confirmed = window.confirm("Warning: This will wipe all manual Tee and Green adjustments. Continue?");
        if (!confirmed) return;

        showToast("Hard Resetting 18 holes from OpenStreetMap...");
        setStatus("Wiping course holes and re-matching all 18 holes from OSM...");
        let syncError: string | null = null;
        try {
          const res = await apiClient.getCourse(activeNeonCourseId, true, true);
          if (res && res.course) {
            courseHolesStore = {};
            await loadCourseFromNeon(activeNeonCourseId);
            showToast(`Hard reset complete for ${res.course.name}! All 18 holes fresh from OSM.`);
          } else {
            showToast("OSM hard reset completed.");
          }
        } catch (err: any) {
          syncError = err?.message || "Overpass error";
          console.error("OSM hard reset failed:", err);
          showToast("OSM hard reset failed: " + syncError);
        } finally {
          if (syncError) {
            setStatus(`Error: ${syncError}`, true);
          } else {
            setStatus("Ready");
          }
        }
      });
    }

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
          const elCourse = document.getElementById("meta-course-name") as HTMLInputElement | null;
          if (elCourse && parsed.metadata.courseName) elCourse.value = parsed.metadata.courseName;
          const elNum = document.getElementById("meta-hole-num") as HTMLInputElement | null;
          if (elNum) elNum.value = String(parsed.metadata.holeNumber || 1);
          const elPar = document.getElementById("meta-hole-par") as HTMLInputElement | null;
          if (elPar) elPar.value = String(parsed.metadata.par || 4);
          const elDir = document.getElementById("meta-green-slope-dir") as HTMLInputElement | null;
          if (elDir) elDir.value = String(parsed.metadata.greenSlopeDir || 215);
          const elPct = document.getElementById("meta-green-slope-pct") as HTMLInputElement | null;
          if (elPct) elPct.value = String(parsed.metadata.greenSlopePct || 2.8);
        }

        document.getElementById("geojson-modal").classList.add("hidden");
        syncMapFromState(true);
        renderSpreads();
        showToast("Custom GeoJSON loaded into Studio!");
      } catch (e) {
        showToast("Invalid GeoJSON syntax — check brackets and coordinates.");
      }
    });

    window.addEventListener("DOMContentLoaded", async () => {
      if (typeof lucide !== "undefined") lucide.createIcons();
      initFallbackMapHole();
      const neonCourses = await loadSavedCoursesDropdown();

      // Neon-first boot: load courses from Neon in <100ms
      try {
        if (neonCourses && neonCourses.length > 0) {
          console.log("Neon Postgres courses available:", neonCourses.length);
          // Look for courses with holes, prioritizing Lakeview
          const withHoles = neonCourses.filter((c: any) => c.holes_count > 0);
          const candidates = withHoles.length > 0 ? withHoles : neonCourses;
          const lakeview = candidates.find((c: any) => c.name.toLowerCase().includes("lakeview"));
          const selected = lakeview || candidates[0];
          const savedSel = document.getElementById("saved-courses-select") as HTMLSelectElement | null;
          if (savedSel) savedSel.value = selected.id;
          await loadCourseFromNeon(selected.id);
          return;
        }
      } catch (e) {
        console.warn("Neon boot check:", e);
      }

      const restored = loadStateFromLocalStorage();
      syncMapFromState(!restored);
      renderSpreads();
      setStatus("Ready");
      if (restored) {
        showToast("Restored saved course & hole from browser storage!");
      }
    });
  

    // Fallback Mode (Phase 5 requirement): Click Tee -> Green 1..18 on map
    let fallbackMapHoleActive = false;
    let fallbackTeePt = null;

    function initFallbackMapHole() {
      const refBtn = document.getElementById("resync-osm-btn") || document.getElementById("auto-targets-btn");
      const parent = refBtn?.parentNode;
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
        parent.insertBefore(btn, refBtn);
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
