import matplotlib.pyplot as plt
import numpy as np
import math
from shapely.geometry import Point as ShPoint, Polygon
from shapely.affinity import rotate
import matplotlib.patches as patches

def smooth_polygon(poly, refinements=3):
    if poly is None or poly.is_empty:
        return poly
    if poly.geom_type == 'MultiPolygon':
        from shapely.geometry import MultiPolygon
        return MultiPolygon([smooth_polygon(p, refinements) for p in poly.geoms])
    
    coords = np.array(poly.exterior.coords)
    for _ in range(refinements):
        pts = coords[:-1]
        num_pts = len(pts)
        if num_pts < 3: break
        new_pts = np.zeros((num_pts * 2, 2))
        for i in range(num_pts):
            p1 = pts[i]
            p2 = pts[(i + 1) % num_pts]
            new_pts[2*i] = p1 * 0.75 + p2 * 0.25
            new_pts[2*i+1] = p1 * 0.25 + p2 * 0.75
        coords = np.vstack((new_pts, new_pts[0]))
    
    interiors = []
    for interior in poly.interiors:
        int_coords = np.array(interior.coords)
        for _ in range(refinements):
            pts = int_coords[:-1]
            num_pts = len(pts)
            if num_pts < 3: break
            new_pts = np.zeros((num_pts * 2, 2))
            for i in range(num_pts):
                p1 = pts[i]
                p2 = pts[(i + 1) % num_pts]
                new_pts[2*i] = p1 * 0.75 + p2 * 0.25
                new_pts[2*i+1] = p1 * 0.25 + p2 * 0.75
            int_coords = np.vstack((new_pts, new_pts[0]))
        interiors.append(int_coords)
        
    return Polygon(coords, interiors)

class GreenPlotter:
    def __init__(self, output_path="hole_1_green.png"):
        self.output_path = output_path
        
    def _get_slope_color(self, s):
        if s < 1: return '#56B4E9'
        elif s < 2: return '#0072B2'
        elif s < 3: return '#009E73'
        elif s < 4: return '#52B788'
        elif s < 5: return '#2D6A4F'
        elif s < 6: return '#E69F00'
        elif s < 7: return '#D55E00'
        elif s < 8: return '#CC3333'
        elif s < 9: return '#990000'
        else: return '#882255'
        
    def generate_plot(self, dem_data, slope_pct, down_gx, down_gy, approach_angle_deg=0, course_name="Golf Course", hole_num=1):
        Z_feet = dem_data['elevation_feet']
        X = dem_data['X']
        Y = dem_data['Y']
        
        local_green = dem_data.get('local_green_poly', None)
        local_bunkers = dem_data.get('local_bunkers', [])
        local_water = dem_data.get('local_water', [])
        
        fig = plt.figure(figsize=(4.25, 7.0), dpi=300)
        
        # 60% Architecture: Green Detailed View (1:480 Scale) on bottom 60%
        ax = fig.add_axes([0, 0, 1, 0.6])
        ax_green = ax # Alias for compatibility with existing code
        
        rotation_angle = approach_angle_deg
        theta = np.radians(rotation_angle) 
        
        cx, cy = 20.0, 20.0 
        if local_green:
            cx, cy = local_green.centroid.x, local_green.centroid.y
            
        X_rot = cx + (X - cx) * np.cos(theta) - (Y - cy) * np.sin(theta)
        Y_rot = cy + (X - cx) * np.sin(theta) + (Y - cy) * np.cos(theta)
        
        gx_rot = down_gx * np.cos(theta) - down_gy * np.sin(theta)
        gy_rot = down_gx * np.sin(theta) + down_gy * np.cos(theta)
        
        local_green_rot = None
        local_bunkers_rot = []
        local_water_rot = []
        local_fairways_rot = []
        local_rough_rot = []
        hole_line_rot = None
        
        local_fairways = dem_data.get('local_fairways', [])
        local_rough = dem_data.get('local_rough', [])
        hole_line = dem_data.get('hole_line')
        
        if local_green:
            # Rotate and SMOOTH geometries
            local_green_rot = smooth_polygon(rotate(local_green, rotation_angle, origin=(cx, cy), use_radians=False))
            fringe_rot = local_green_rot.buffer(1.2)
            
            if hole_line:
                hole_line_rot = rotate(hole_line, rotation_angle, origin=(cx, cy), use_radians=False)
            
            for b in local_bunkers:
                local_bunkers_rot.append(smooth_polygon(rotate(b, rotation_angle, origin=(cx, cy), use_radians=False)))
            for w in local_water:
                local_water_rot.append(smooth_polygon(rotate(w, rotation_angle, origin=(cx, cy), use_radians=False)))
            for f in local_fairways:
                local_fairways_rot.append(smooth_polygon(rotate(f, rotation_angle, origin=(cx, cy), use_radians=False)))
            for r in local_rough:
                local_rough_rot.append(smooth_polygon(rotate(r, rotation_angle, origin=(cx, cy), use_radians=False)))
            
            # Vectorized masking (Massively faster than double-looping)
            import shapely
            pts = shapely.points(X_rot.ravel(), Y_rot.ravel())
            mask = shapely.contains(fringe_rot, pts).reshape(X_rot.shape)
            Z_feet[~mask] = np.nan
        
        yard_to_m = 0.9144
        grid_5yd_m = 5 * yard_to_m
        grid_1yd_m = 1 * yard_to_m
        
        # --- Strict USGA 1:480 Scale Enforcement ---
        # 4.25 inches at 1:480 = 2040 inches = 51.816 meters
        # 7.0 inches at 1:480 = 3360 inches = 85.344 meters
        base_width_m = 51.816
        base_height_m = 85.344
        
        all_minx = cx - base_width_m / 2
        all_maxx = cx + base_width_m / 2
        y_top = cy + base_height_m / 4
        y_bottom = cy - (3 * base_height_m) / 4
        divider_y = cy - base_height_m / 4
        total_depth = 0
        
        if local_green_rot:
            minx, miny, maxx, maxy = local_green_rot.bounds
            
            green_w = maxx - minx
            green_h = maxy - miny
            
            # Map 60% height available for green is base_height_m * 0.6 = 51.2064
            # We enforce scale_factor >= 1.0 (never zoom in more than 1:480)
            scale_factor = max(1.0, (green_w + 10.0) / base_width_m, (green_h + 10.0) / (base_height_m * 0.6))
            
            final_w = base_width_m * scale_factor
            final_h = (base_height_m * 0.6) * scale_factor
            
            all_minx = cx - final_w / 2
            all_maxx = cx + final_w / 2
            y_top = cy + final_h / 2
            y_bottom = cy - final_h / 2
            
            total_depth = int(round((maxy - miny) / yard_to_m))

        # Z-Orders:
        # Water/Fringe = 1, Bunkers = 1.5, Green Fill = 1.8
        # 1-yd Grid = 2.0, 5-yd Grid = 2.1
        # Green Border = 2.5
        # Contours = 3, Arrows = 4
        # Blank Mask = 10, UI = 11

        if local_green_rot:
            for w in local_water_rot:
                if w.is_empty: continue
                try:
                    x_w, y_w = w.exterior.xy
                    ax.fill(x_w, y_w, color='#a0c4ff', zorder=1)
                    ax.plot(x_w, y_w, color='#4a80cc', linewidth=1.0, zorder=1)
                except: pass
                    
            for b in local_bunkers_rot:
                if b.is_empty: continue
                try:
                    x_b, y_b = b.exterior.xy
                    ax.fill(x_b, y_b, color='#e5dacc', zorder=1.5)
                    ax.plot(x_b, y_b, color='#b0b0b0', linewidth=0.8, zorder=1.5)
                except: pass
                    
            x_f, y_f = fringe_rot.exterior.xy
            ax.fill(x_f, y_f, color='white', zorder=1)
            ax.plot(x_f, y_f, color='#777777', linewidth=0.8, linestyle='--', zorder=2.5)
            
            x_g, y_g = local_green_rot.exterior.xy
            ax.fill(x_g, y_g, color='white', zorder=1.8)
            ax.plot(x_g, y_g, color='#3a8c54', linewidth=2.0, zorder=2.5)
        
        if local_green_rot:
            depth_yds = 0
            
            # --- Anchor grid perfectly to the green geometry ---
            # Horizontal lines anchored to miny (front of green)
            start_ny1 = math.floor((y_bottom - miny) / grid_1yd_m)
            end_ny1 = math.ceil((y_top - miny) / grid_1yd_m)
            for n in range(start_ny1, end_ny1 + 1):
                y_line = miny + n * grid_1yd_m
                ax.plot([all_minx, all_maxx], [y_line, y_line], color='#f0f0f0', linestyle='-', linewidth=0.3, zorder=2.0)
                
            start_ny5 = math.floor((y_bottom - miny) / grid_5yd_m)
            end_ny5 = math.ceil((y_top - miny) / grid_5yd_m)
            for n in range(start_ny5, end_ny5 + 1):
                y_line = miny + n * grid_5yd_m
                ax.plot([all_minx, all_maxx], [y_line, y_line], color='#d5d5d5', linestyle='-', linewidth=0.6, zorder=2.1)
                
            # Vertical lines anchored to cx (center of green)
            start_nx1 = math.floor((all_minx - cx) / grid_1yd_m)
            end_nx1 = math.ceil((all_maxx - cx) / grid_1yd_m)
            for n in range(start_nx1, end_nx1 + 1):
                x_line = cx + n * grid_1yd_m
                ax.plot([x_line, x_line], [y_bottom, y_top], color='#f0f0f0', linestyle='-', linewidth=0.3, zorder=2.0)
                
            start_nx5 = math.floor((all_minx - cx) / grid_5yd_m)
            end_nx5 = math.ceil((all_maxx - cx) / grid_5yd_m)
            for n in range(start_nx5, end_nx5 + 1):
                x_line = cx + n * grid_5yd_m
                ax.plot([x_line, x_line], [y_bottom, y_top], color='#d5d5d5', linestyle='-', linewidth=0.6, zorder=2.1)
                
            # Depth Labels (hug the green boundary tightly)
            from shapely.geometry import LineString
            curr_y = miny
            while curr_y <= maxy:
                if depth_yds % 5 == 0 and depth_yds >= 0:
                    hline = LineString([(all_minx, curr_y), (all_maxx, curr_y)])
                    intersection = hline.intersection(local_green_rot)
                    if not intersection.is_empty:
                        min_ix, _, max_ix, _ = intersection.bounds
                        ax.text(min_ix - 1.5, curr_y, f"{depth_yds}", va='center', ha='right', fontsize=6, color='#555555', fontweight='bold', zorder=11)
                        ax.text(max_ix + 1.5, curr_y, f"{depth_yds}", va='center', ha='left', fontsize=6, color='#555555', fontweight='bold', zorder=11)
                curr_y += grid_5yd_m
                depth_yds += 5

        min_z = np.floor(np.nanmin(Z_feet) * 2) / 2
        max_z = np.ceil(np.nanmax(Z_feet) * 2) / 2
        levels = np.arange(min_z, max_z + 0.5, 0.5)
        
        contours = ax.contour(X_rot, Y_rot, Z_feet, levels=levels, colors='#666666', linewidths=0.6, alpha=0.9, zorder=3)
        def fmt(x):
            if x > 0: return f"+{x:.1f}"
            if x == 0: return "0.0"
            return f"{x:.1f}"
        ax.clabel(contours, inline=True, fontsize=5, fmt=fmt, colors='#444444')
        
        step = 2
        magnitude = np.sqrt(gx_rot**2 + gy_rot**2)
        magnitude[magnitude == 0] = 1e-10
        norm_gx = gx_rot / magnitude
        norm_gy = gy_rot / magnitude
        
        mask_green = np.zeros(X_rot.shape, dtype=bool)
        mask_fringe = np.zeros(X_rot.shape, dtype=bool)
        if local_green_rot:
            import shapely
            pts = shapely.points(X_rot.ravel(), Y_rot.ravel())
            mask_green = shapely.contains(local_green_rot, pts).reshape(X_rot.shape)
            mask_fringe_full = shapely.contains(fringe_rot, pts).reshape(X_rot.shape)
            mask_fringe = mask_fringe_full & (~mask_green)
                        
        valid_slope = slope_pct > 0.5
        plot_mask_green = mask_green & valid_slope
        plot_mask_fringe = mask_fringe & valid_slope
        
        pg_x = X_rot[::step, ::step][plot_mask_green[::step, ::step]]
        pg_y = Y_rot[::step, ::step][plot_mask_green[::step, ::step]]
        pg_u = norm_gx[::step, ::step][plot_mask_green[::step, ::step]]
        pg_v = norm_gy[::step, ::step][plot_mask_green[::step, ::step]]
        pg_s = slope_pct[::step, ::step][plot_mask_green[::step, ::step]]
        
        colors = [self._get_slope_color(s) for s in pg_s]
        
        if len(pg_x) > 0:
            ax.quiver(pg_x, pg_y, pg_u, pg_v, color=colors, 
                      angles='xy', scale_units='xy', scale=0.66,
                      headwidth=3, headlength=3, width=0.003, 
                      pivot='mid', zorder=4)
            
            text_step = 10
            pt_x = X_rot[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_y = Y_rot[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_u = norm_gx[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_v = norm_gy[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_s = slope_pct[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_c = [self._get_slope_color(s) for s in pt_s]
            
            for ix, iy, iu, iv, islope, c in zip(pt_x, pt_y, pt_u, pt_v, pt_s, pt_c):
                ax.text(ix - iu*0.5, iy - iv*0.5, f"{islope:.1f}", 
                        fontsize=6, color='black', fontweight='normal', ha='center', va='center', zorder=5)
                        
        pf_x = X_rot[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_y = Y_rot[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_u = norm_gx[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_v = norm_gy[::step, ::step][plot_mask_fringe[::step, ::step]]
        
        if len(pf_x) > 0:
            ax.quiver(pf_x, pf_y, pf_u, pf_v, color='#d05090', alpha=0.5,
                      angles='xy', scale_units='xy', scale=0.66,
                      headwidth=3, headlength=3, width=0.003, 
                      pivot='mid', zorder=4)

        compass_angle_rad = np.radians(approach_angle_deg + 90)
        
        if local_green_rot:
            ax_green.set_xlim(all_minx, all_maxx)
            ax_green.set_ylim(y_bottom, y_top)
            
            # Compass & Title (Top Left)
            cx_comp = all_minx + 7
            cy_comp = y_top - 7
            
            # Simple Triangle Compass
            c, s = np.cos(compass_angle_rad), np.sin(compass_angle_rad)
            def rot_pt(px, py): return (cx_comp + px*c - py*s, cy_comp + px*s + py*c)
            
            # Triangle pointing North
            p1 = rot_pt(0, 1.5)      # Tip
            p2 = rot_pt(-0.8, -1.0)  # Left base
            p3 = rot_pt(0.8, -1.0)   # Right base
            
            ax_green.add_patch(patches.Polygon([p1, p2, p3], facecolor='#333333', edgecolor='none', zorder=12))
            
            # 'N' Label just past the tip of the triangle
            nx, ny = rot_pt(0, 2.5)
            ax_green.text(nx, ny, 'N', fontsize=9, fontweight='bold', ha='center', va='center', color='#333333', rotation=approach_angle_deg, zorder=12)
            
            ax_green.text(cx_comp + 6, cy_comp, f"{course_name.replace(' Golf Course', '')}", 
                    fontsize=10, fontweight='bold', ha='left', va='center', zorder=11)
                    
            # Total Depth Top Right
            ax_green.text(all_maxx - 2, y_top - 5, f"{total_depth}", 
                    fontsize=18, fontweight='bold', ha='right', va='center', color='#333333', zorder=11)
            
            # Horizontal Legend Bar - Moved UP significantly from bottom
            legend_colors = ['#56B4E9', '#0072B2', '#009E73', '#52B788', '#2D6A4F', '#E69F00', '#D55E00', '#CC3333', '#990000', '#882255']
            legend_labels = ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9+']
            
            bar_w = (all_maxx - all_minx - 10) / 10
            bar_y = y_bottom + 2
            for i, (c, l) in enumerate(zip(legend_colors, legend_labels)):
                rect_leg = patches.Rectangle((all_minx + 5 + i*bar_w, bar_y), bar_w, 1.5, facecolor=c, zorder=11)
                ax_green.add_patch(rect_leg)
                ax_green.text(all_minx + 5 + i*bar_w + bar_w/2, bar_y - 0.5, l, fontsize=5, ha='center', va='top', fontweight='bold', zorder=11)
                
        ax_green.set_aspect('equal', 'box')
        ax_green.set_xticks([])
        ax_green.set_yticks([])
        ax_green.spines['top'].set_visible(False)
        ax_green.spines['right'].set_visible(False)
        ax_green.spines['bottom'].set_visible(False)
        ax_green.spines['left'].set_visible(False)
        
        # Border around the whole figure
        rect = plt.Rectangle((0, 0), 1, 1, transform=fig.transFigure, linewidth=6, edgecolor='#5c805c', facecolor='none', zorder=20)
        fig.patches.append(rect)
        
        # Divider line exactly at 0.6 (60% from bottom)
        line = plt.Line2D((0, 1), (0.6, 0.6), transform=fig.transFigure, color='#27ae60', linewidth=2, zorder=20)
        fig.lines.append(line)
        
        # Notes section (Top 40%)
        ax_notes = fig.add_axes([0, 0.6, 1, 0.4])
        ax_notes.axis('off')
        
        # Calculate yardage and par from hole_line if available
        yard_to_m = 0.9144
        yardage = 0
        par = 4
        if hole_line:
            yardage = int(round(hole_line.length / yard_to_m))
            if yardage < 250: par = 3
            elif yardage > 470: par = 5
            
        # Add header info
        ax_notes.text(0.95, 0.9, f"HOLE {hole_num}", fontsize=20, fontweight='bold', ha='right', va='top', color='#333333', transform=ax_notes.transAxes)
        ax_notes.text(0.95, 0.75, f"PAR {par}  |  {yardage} YDS", fontsize=10, fontweight='bold', ha='right', va='top', color='#27ae60', transform=ax_notes.transAxes)
        
        ax_notes.text(0.05, 0.9, 'NOTES', fontsize=10, fontweight='bold', transform=ax_notes.transAxes, color='#a0a0a0')
        
        ax.set_facecolor('#ffffff')
        
        plt.subplots_adjust(left=0, right=1, bottom=0, top=1)
        plt.savefig(self.output_path, facecolor='white')
        plt.close()
        print(f"Plot saved to {self.output_path}")
