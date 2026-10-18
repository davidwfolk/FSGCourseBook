import os
import math
from PIL import Image
from src.osm_client import get_hole_geometries
from src.dem_processor import DEMProcessor
from src.plotter import GreenPlotter

def main():
    course_name = "Lakeview Golf Course"
    city = "Meridian"
    state = "ID"
    
    print(f"--- Phase 2: Compiling 18-Hole Tour Book for {course_name} ---")
    
    # Fetching REAL USGS 3DEP elevation data!
    processor = DEMProcessor(use_synthetic=False)
    
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)
    generated_images = []
    
    for hole_num in range(1, 19):
        print(f"\n======================================")
        print(f"         PROCESSING HOLE {hole_num}         ")
        print(f"======================================")
        
        # 1. Fetch Geometries from OSM
        print("[1/3] Fetching precise geometries from OpenStreetMap...")
        hole_data = get_hole_geometries(course_name, hole_num, city, state)
        
        green_poly = hole_data['green']
        tee_point = hole_data['tee']
        bunkers = hole_data['bunkers']
        fairways = hole_data['fairways']
        rough = hole_data['rough']
        water_hazards = hole_data['water']
        hole_line = hole_data['hole_line']
        
        if tee_point is None or green_poly is None:
            print(f"Skipping Hole {hole_num}: Missing tee or green data.")
            continue
            
        print(f"Green Polygon center: {green_poly.centroid.x:.5f}, {green_poly.centroid.y:.5f}")
        print(f"Tee Point: {tee_point.x:.5f}, {tee_point.y:.5f}")
        print(f"Found {len(bunkers)} Bunkers, {len(fairways)} Fairways.")
        
        # Calculate approach angle (heading from tee to green)
        dy = green_poly.centroid.y - tee_point.y
        dx = (green_poly.centroid.x - tee_point.x) * math.cos(math.radians(green_poly.centroid.y))
        math_angle = math.degrees(math.atan2(dy, dx))
        approach_angle_deg = (90 - math_angle) % 360
        print(f"Approach Bearing: {approach_angle_deg:.1f} degrees")
        
        # 2. Process DEM
        print("\n[2/3] Processing DEM data...")
        dem_data = processor.get_elevation_data(hole_data)
        
        slope_pct, aspect_rad, down_gx, down_gy = processor.compute_slope_and_aspect(
            dem_data['elevation_feet'], 
            dem_data['X'][0, :],
            dem_data['Y'][:, 0]
        )
        
        # 3. Generate Plot
        print("\n[3/3] Generating Tour-style contour plot...")
        out_png = os.path.join(output_dir, f"hole_{hole_num}_green.png")
        plotter = GreenPlotter(output_path=out_png)
        plotter.generate_plot(dem_data, slope_pct, down_gx, down_gy, approach_angle_deg=approach_angle_deg, course_name=course_name, hole_num=hole_num)
        
        generated_images.append(out_png)
        print(f"Saved {out_png}")
        
    # Compile PDF
    if generated_images:
        print("\n--- Compiling PDF Tour Book ---")
        pdf_path = f"{course_name.replace(' ', '_')}_TourBook.pdf"
        
        images = [Image.open(img).convert('RGB') for img in generated_images]
        
        images[0].save(
            pdf_path, 
            save_all=True, 
            append_images=images[1:],
            resolution=100.0
        )
        print(f"SUCCESS: Compiled all holes into {pdf_path}")
    else:
        print("No holes generated.")

if __name__ == "__main__":
    main()
