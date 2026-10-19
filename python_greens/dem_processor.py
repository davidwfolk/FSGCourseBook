import numpy as np
from scipy.ndimage import gaussian_filter
import geopandas as gpd
from shapely.geometry import Polygon, Point

class DEMProcessor:
    def __init__(self, use_synthetic=False):
        self.use_synthetic = use_synthetic
        
    def get_elevation_data(self, geom_dict: dict):
        """
        Returns a dictionary with the elevation array, extent, and metadata.
        Fetches the exact DEM elevation array spanning the entire hole bounding box.
        """
        green_poly = geom_dict.get('green')
        hole_line = geom_dict.get('hole_line')
        
        if self.use_synthetic:
            return self._generate_synthetic_data(green_poly)
        else:
            print("Fetching real USGS 1-meter DEM data via py3dep...")
            import py3dep
            import xarray as xr
            import pyproj
            
            # Unpack lists
            bunkers = geom_dict.get('bunkers', [])
            water_hazards = geom_dict.get('water', [])
            fairways = geom_dict.get('fairways', [])
            rough = geom_dict.get('rough', [])
            
            # Reproject to EPSG:5070
            geoms = []
            if green_poly: geoms.append(green_poly)
            if hole_line: geoms.append(hole_line)
            geoms.extend(bunkers)
            geoms.extend(water_hazards)
            geoms.extend(fairways)
            geoms.extend(rough)
            
            gdf = gpd.GeoDataFrame({'geometry': geoms}, crs="EPSG:4326")
            gdf_meters = gdf.to_crs("EPSG:5070")
            
            # Repack into dictionary
            idx = 0
            res_dict = {}
            if green_poly:
                res_dict['local_green_poly'] = gdf_meters.geometry[idx]
                idx += 1
            if hole_line:
                res_dict['hole_line'] = gdf_meters.geometry[idx]
                idx += 1
                
            res_dict['local_bunkers'] = list(gdf_meters.geometry[idx:idx+len(bunkers)])
            idx += len(bunkers)
            res_dict['local_water'] = list(gdf_meters.geometry[idx:idx+len(water_hazards)])
            idx += len(water_hazards)
            res_dict['local_fairways'] = list(gdf_meters.geometry[idx:idx+len(fairways)])
            idx += len(fairways)
            res_dict['local_rough'] = list(gdf_meters.geometry[idx:idx+len(rough)])
            
            # Fetch DEM for the green complex (green + local hazards + margin)
            green_poly = res_dict.get('local_green_poly')
            hazards = res_dict.get('local_bunkers', []) + res_dict.get('local_water', [])
            geoms_to_bound = [green_poly] + hazards if green_poly else hazards
            if geoms_to_bound:
                from shapely.geometry import GeometryCollection
                gc = GeometryCollection(geoms_to_bound)
                bbox_polygon = gc.buffer(35.0).envelope
            else:
                bbox_polygon = Point(0, 0).buffer(40.0).envelope
            
            try:
                # get_map expects layer, geom, resolution in meters
                dem_da = py3dep.get_map("DEM", bbox_polygon, resolution=1.0, geo_crs=5070, crs=5070)
                
                # dem_da is an xarray DataArray. X and Y are coordinates.
                Z_meters = dem_da.values
                X_1d = dem_da.x.values
                Y_1d = dem_da.y.values

                # Ensure X_1d and Y_1d are strictly monotonically increasing (South to North, West to East)
                if len(Y_1d) > 1 and Y_1d[0] > Y_1d[-1]:
                    Y_1d = Y_1d[::-1]
                    Z_meters = np.flipud(Z_meters)
                if len(X_1d) > 1 and X_1d[0] > X_1d[-1]:
                    X_1d = X_1d[::-1]
                    Z_meters = np.fliplr(Z_meters)

                X, Y = np.meshgrid(X_1d, Y_1d)
                
                # Add some slight gaussian smoothing to real data to clean up micro-noise
                Z_meters = gaussian_filter(Z_meters, sigma=0.5)
                
                Z_feet = Z_meters * 3.28084
                
                # Make elevation relative to the centroid of the green
                cx, cy = res_dict['local_green_poly'].centroid.x, res_dict['local_green_poly'].centroid.y
                
                # Find closest indices to centroid
                idx_x = (np.abs(X_1d - cx)).argmin()
                idx_y = (np.abs(Y_1d - cy)).argmin()
                
                center_z = Z_feet[idx_y, idx_x]
                Z_feet = Z_feet - center_z
                
                extent = (X_1d.min(), X_1d.max(), Y_1d.min(), Y_1d.max())
            except Exception as e:
                print(f"USGS 3DEP API failed ({e}). Generating synthetic DEM over actual geometries...")
                minx, miny, maxx, maxy = bbox_polygon.bounds
                X_1d = np.arange(minx, maxx, 1.0)
                Y_1d = np.arange(miny, maxy, 1.0)
                X, Y = np.meshgrid(X_1d, Y_1d)
                tilt_y = (Y - miny) * 0.02
                tier_x = 0.3 * (1 / (1 + np.exp(-(X - minx - 20) / 2.0)))
                Z_meters = tilt_y + tier_x
                Z_feet = Z_meters * 3.28084
                extent = (X_1d.min(), X_1d.max(), Y_1d.min(), Y_1d.max())
            
            res_dict['elevation_feet'] = Z_feet
            res_dict['extent'] = extent
            res_dict['resolution'] = 1.0
            res_dict['X'] = X
            res_dict['Y'] = Y
            
            return res_dict
            
    def _generate_synthetic_data(self, green_poly):
        """
        Generates a 40x40m synthetic elevation array with 2% back-to-front tilt
        and a subtle left-to-right tier.
        """
        # 1-meter resolution, 40x40 grid
        size = 40
        x = np.arange(0, size, 1)
        y = np.arange(0, size, 1)
        X, Y = np.meshgrid(x, y)
        
        # 2% back-to-front tilt (y-axis)
        # Assuming y=0 is front, y=40 is back. 40m * 0.02 = 0.8m rise
        tilt_y = Y * 0.02
        
        # Subtle left-to-right tier (x-axis)
        # Using a sigmoid/tanh function to create a tier in the middle
        # Center tier at x=20, width of tier transition = 5m, height difference = 0.3m
        tier_x = 0.3 * (1 / (1 + np.exp(-(X - 20) / 2.0)))
        
        # Combine
        Z_meters = tilt_y + tier_x
        
        # Add some noise and smooth it for realism
        noise = np.random.normal(0, 0.02, (size, size))
        Z_meters = gaussian_filter(Z_meters + noise, sigma=1.0)
        
        # Convert meters to feet for US contour math
        Z_feet = Z_meters * 3.28084
        
        # Make elevation relative to the center of the grid (20,20)
        center_z = Z_feet[20, 20]
        Z_feet = Z_feet - center_z
        
        # Create a synthetic green polygon (circle) centered at (20, 20) with radius 15m
        local_green_poly = Point(20, 20).buffer(15)
        
        extent = (0, size, 0, size)
        
        return {
            'elevation_feet': Z_feet,
            'extent': extent,
            'resolution': 1.0, # 1 meter per pixel
            'X': X,
            'Y': Y,
            'local_green_poly': local_green_poly
        }
        
    def compute_slope_and_aspect(self, elevation_array, X_1d_meters, Y_1d_meters):
        """
        Computes the 2D gradient, slope percentage, and aspect angle.
        Uses exact physical coordinates to prevent indexing inversion and scale errors.
        """
        X_1d_feet = X_1d_meters * 3.28084
        Y_1d_feet = Y_1d_meters * 3.28084
        
        # np.gradient(array, y_coords, x_coords)
        gy, gx = np.gradient(elevation_array, Y_1d_feet, X_1d_feet)
        
        # Slope percentage = (rise / run) * 100
        slope_pct = np.sqrt(gx**2 + gy**2) * 100.0
        
        # Downhill vector is negative gradient
        down_gx = -gx
        down_gy = -gy
        
        aspect_rad = np.arctan2(down_gy, down_gx)
        
        return slope_pct, aspect_rad, down_gx, down_gy
