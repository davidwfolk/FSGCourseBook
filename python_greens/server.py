import os
import io
import base64
import json
import hashlib
import math
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from shapely.geometry import Polygon, Point, LineString
import numpy as np

from python_greens.dem_processor import DEMProcessor
from python_greens.plotter import GreenPlotter

app = FastAPI(title="FSG-Greens-Book Tour Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GREEN_LAYOUT_VERSION = "v3_3panel_smooth"
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

class RenderGreenRequest(BaseModel):
    course_id: Optional[str] = "default"
    course_name: Optional[str] = "Golf Course"
    hole_number: int = 1
    par: int = 4
    yardage: int = 350
    approach_bearing: float = 0.0
    green_coord: Optional[List[float]] = None
    green_polygon: List[List[float]] = Field(default_factory=list)
    pivot_coord: Optional[List[float]] = None
    tee_coord: Optional[List[float]] = None
    bunkers: List[List[List[float]]] = Field(default_factory=list)
    water: List[List[List[float]]] = Field(default_factory=list)
    force_refresh: bool = False

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "fsg-greens-book"}

@app.post("/api/render-green")
async def render_green(req: RenderGreenRequest):
    try:
        c_id = (req.course_id or "default").replace("/", "_").replace("\\", "_")
        h_num = req.hole_number
        app_deg = round(req.approach_bearing)

        # Coordinate hash matching exact JS stringify + bitwise loop
        coord_str = json.dumps(req.green_polygon or [], separators=(',', ':'))
        coord_hash = 0
        for char in coord_str:
            coord_hash = ((coord_hash << 5) - coord_hash) + ord(char)
            coord_hash = (coord_hash & 0xFFFFFFFF)
            if coord_hash >= 0x80000000:
                coord_hash -= 0x100000000
        token_str = str(abs(coord_hash))
        cache_key = f"{c_id}_{h_num}_{GREEN_LAYOUT_VERSION}_{app_deg}_{token_str}"
        cache_token = cache_key

        png_cache_path = os.path.join(CACHE_DIR, f"hole_{cache_token}.png")
        svg_cache_path = os.path.join(CACHE_DIR, f"hole_{cache_token}.svg")
        meta_cache_path = os.path.join(CACHE_DIR, f"hole_{cache_token}.json")
        
        # Check cache if not force_refresh
        if not req.force_refresh and os.path.exists(png_cache_path) and os.path.exists(meta_cache_path):
            try:
                with open(meta_cache_path, "r", encoding="utf-8") as mf:
                    meta = json.load(mf)
                    if meta.get("token") == cache_token and meta.get("layout_version") == GREEN_LAYOUT_VERSION:
                        with open(png_cache_path, "rb") as pf:
                            png_bytes = pf.read()
                        svg_str = ""
                        if os.path.exists(svg_cache_path):
                            with open(svg_cache_path, "r", encoding="utf-8") as sf:
                                svg_str = sf.read()
                        
                        b64_img = base64.b64encode(png_bytes).decode("utf-8")
                        return {
                            "image_base64": f"data:image/png;base64,{b64_img}",
                            "svg": svg_str,
                            "cached": True,
                            "hole_number": h_num,
                            "total_depth": meta.get("total_depth", 30),
                            "avg_slope": meta.get("avg_slope", 2.8),
                            "layout_version": GREEN_LAYOUT_VERSION,
                            "cache_key": cache_key
                        }
            except Exception as e:
                print("Cache read error:", e)

        # Build Shapely geometries and fetch DEM with bad geometry crash protection
        try:
            green_poly = None
            if req.green_polygon and len(req.green_polygon) >= 3:
                coords = [tuple(pt) for pt in req.green_polygon]
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                green_poly = Polygon(coords)
                if not green_poly.is_valid:
                    try:
                        fixed = shapely.make_valid(green_poly)
                        if fixed.geom_type == 'Polygon' and not fixed.is_empty:
                            green_poly = fixed
                        elif fixed.geom_type == 'MultiPolygon' and not fixed.is_empty:
                            green_poly = max(fixed.geoms, key=lambda g: g.area)
                    except Exception:
                        pass
                if not green_poly.is_valid or green_poly.is_empty:
                    raise ValueError("Polygon is self-intersecting or invalid")
            elif req.green_coord and len(req.green_coord) == 2:
                # Fallback circle ~25m radius if only center coordinate provided
                green_poly = Point(req.green_coord[0], req.green_coord[1]).buffer(0.00025)
            else:
                raise ValueError("Missing valid green_polygon or green_coord")

            bunker_polys = []
            for b in req.bunkers:
                if b and len(b) >= 3:
                    b_coords = [tuple(pt) for pt in b]
                    if b_coords[0] != b_coords[-1]:
                        b_coords.append(b_coords[0])
                    try:
                        bp = Polygon(b_coords)
                        if not bp.is_valid:
                            bp = shapely.make_valid(bp)
                        if bp.geom_type == 'MultiPolygon' and not bp.is_empty:
                            bp = max(bp.geoms, key=lambda g: g.area)
                        if bp.is_valid and not bp.is_empty and bp.geom_type == 'Polygon':
                            bunker_polys.append(bp)
                    except:
                        pass

            water_polys = []
            for w in req.water:
                if w and len(w) >= 3:
                    w_coords = [tuple(pt) for pt in w]
                    if w_coords[0] != w_coords[-1]:
                        w_coords.append(w_coords[0])
                    try:
                        wp = Polygon(w_coords)
                        if not wp.is_valid:
                            wp = shapely.make_valid(wp)
                        if wp.geom_type == 'MultiPolygon' and not wp.is_empty:
                            wp = max(wp.geoms, key=lambda g: g.area)
                        if wp.is_valid and not wp.is_empty and wp.geom_type == 'Polygon':
                            water_polys.append(wp)
                    except:
                        pass

            # Create approach line (from actual pivot/tee or along approach bearing)
            g_center = green_poly.centroid
            if req.pivot_coord and len(req.pivot_coord) == 2:
                hole_line = LineString([Point(req.pivot_coord[0], req.pivot_coord[1]), g_center])
            elif req.tee_coord and len(req.tee_coord) == 2 and req.par == 3:
                hole_line = LineString([Point(req.tee_coord[0], req.tee_coord[1]), g_center])
            else:
                back_rad = math.radians((req.approach_bearing + 180) % 360)
                d_lat = (120.0 / 111320.0) * math.cos(back_rad)
                d_lon = (120.0 / (111320.0 * math.cos(math.radians(g_center.y)))) * math.sin(back_rad)
                hole_line = LineString([Point(g_center.x + d_lon, g_center.y + d_lat), g_center])

            geom_dict = {
                'green': green_poly,
                'bunkers': bunker_polys,
                'water': water_polys,
                'hole_line': hole_line,
                'fairways': [],
                'rough': []
            }

            # Process real USGS 3DEP 1m elevation
            processor = DEMProcessor(use_synthetic=False)
            dem_data = processor.get_elevation_data(geom_dict)
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"detail": f"Geometry Error: {str(e)}. Ensure the green polygon is not self-intersecting."}
            )
        
        slope_pct, aspect_rad, down_gx, down_gy = processor.compute_slope_and_aspect(
            dem_data['elevation_feet'],
            dem_data['X'][0, :],
            dem_data['Y'][:, 0]
        )

        # Plot with Tour USGA 1:480 standards
        plotter = GreenPlotter(output_path=png_cache_path)
        plot_res = plotter.generate_plot(
            dem_data=dem_data,
            slope_pct=slope_pct,
            down_gx=down_gx,
            down_gy=down_gy,
            approach_angle_deg=req.approach_bearing,
            course_name=req.course_name or "Golf Course",
            hole_num=req.hole_number,
            par=req.par,
            yardage=req.yardage
        )

        png_bytes = plot_res['png_bytes']
        svg_str = plot_res.get('svg_str', '')

        # Save SVG to cache
        try:
            with open(svg_cache_path, "w", encoding="utf-8") as sf:
                sf.write(svg_str)
            avg_slope = round(float(np.nanmean(slope_pct)), 1) if slope_pct is not None else 2.8
            total_depth = plot_res.get('total_depth', 30)
            with open(meta_cache_path, "w", encoding="utf-8") as mf:
                json.dump({
                    "token": cache_token,
                    "cache_key": cache_key,
                    "layout_version": GREEN_LAYOUT_VERSION,
                    "timestamp": os.path.getmtime(png_cache_path),
                    "total_depth": total_depth,
                    "avg_slope": avg_slope
                }, mf)
        except Exception as e:
            print("Failed to save cache metadata:", e)

        b64_img = base64.b64encode(png_bytes).decode("utf-8")
        return {
            "image_base64": f"data:image/png;base64,{b64_img}",
            "svg": svg_str,
            "cached": False,
            "hole_number": h_num,
            "total_depth": plot_res.get('total_depth', 30),
            "avg_slope": round(float(np.nanmean(slope_pct)), 1) if slope_pct is not None else 2.8,
            "layout_version": GREEN_LAYOUT_VERSION,
            "cache_key": cache_key
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("python_greens.server:app", host="127.0.0.1", port=8000, reload=True)
