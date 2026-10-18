import io
import math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from shapely.geometry import Point as ShPoint, Polygon
from shapely.affinity import rotate

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
    def __init__(self, output_path=None):
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
        
    def generate_plot(self, dem_data, slope_pct, down_gx, down_gy, approach_angle_deg=0, course_name="Golf Course", hole_num=1, par=4, yardage=350, as_format="both"):
        """
        Renders a Tour USGA 1:480 Green Complex Booklet Page.
        Layout:
          - Aspect ratio: 3.75" x 10.5" (matching 540x1512 canvas)
          - Outer border: Tour Green #5c805c (linewidth 6)
          - Top 60%: Locked USGA 1:480 Green Complex rotated by approach angle
          - Bottom 40%: Notes section with ruled lines and hole metadata
        Returns dict with 'png_bytes' and/or 'svg_str', and saves to output_path if set.
        """
        Z_feet = dem_data['elevation_feet'].copy()
        X = dem_data['X']
        Y = dem_data['Y']
        
        local_green = dem_data.get('local_green_poly', None)
        local_bunkers = dem_data.get('local_bunkers', [])
        local_water = dem_data.get('local_water', [])
        local_fairways = dem_data.get('local_fairways', [])
        local_rough = dem_data.get('local_rough', [])
        hole_line = dem_data.get('hole_line')

        # Calculate yardage from hole_line if not provided
        yard_to_m = 0.9144
        if hole_line and (not yardage or yardage == 350):
            try:
                calc_yds = int(round(hole_line.length / yard_to_m))
                if calc_yds > 50:
                    yardage = calc_yds
            except:
                pass

        # Figure setup: 3.75 x 10.5 inches (exact 1:2.8 aspect ratio matching 540x1512)
        fig = plt.figure(figsize=(3.75, 10.5), dpi=300)
        
        # 60% Top: Green Detailed View (1:480 Scale)
        ax_green = fig.add_axes([0, 0.40, 1, 0.60])
        
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
        fringe_rot = None
        
        if local_green:
            local_green_rot = smooth_polygon(rotate(local_green, rotation_angle, origin=(cx, cy), use_radians=False))
            fringe_rot = local_green_rot.buffer(1.2)
            
            for b in local_bunkers:
                try:
                    local_bunkers_rot.append(smooth_polygon(rotate(b, rotation_angle, origin=(cx, cy), use_radians=False)))
                except: pass
            for w in local_water:
                try:
                    local_water_rot.append(smooth_polygon(rotate(w, rotation_angle, origin=(cx, cy), use_radians=False)))
                except: pass
            
            # Mask Z_feet outside fringe
            import shapely
            pts = shapely.points(X_rot.ravel(), Y_rot.ravel())
            mask = shapely.contains(fringe_rot, pts).reshape(X_rot.shape)
            Z_feet[~mask] = np.nan
        
        grid_5yd_m = 5 * yard_to_m
        grid_1yd_m = 1 * yard_to_m
        
        # Strict USGA 1:480 Scale:
        # 3.75 inches at 1:480 = 1800 inches = 45.72 meters
        # 6.30 inches (60% height) at 1:480 = 3024 inches = 76.81 meters
        base_width_m = 45.72
        base_height_m = 76.81
        
        all_minx = cx - base_width_m / 2
        all_maxx = cx + base_width_m / 2
        y_top = cy + base_height_m * 0.46
        y_bottom = cy - base_height_m * 0.54
        total_depth = 0
        
        if local_green_rot:
            minx, miny, maxx, maxy = local_green_rot.bounds
            green_w = maxx - minx
            green_h = maxy - miny
            
            scale_factor = max(1.0, (green_w + 8.0) / base_width_m, (green_h + 16.0) / base_height_m)
            
            final_w = base_width_m * scale_factor
            final_h = base_height_m * scale_factor
            
            all_minx = cx - final_w / 2
            all_maxx = cx + final_w / 2
            y_top = cy + final_h * 0.46
            y_bottom = cy - final_h * 0.54
            
            total_depth = int(round((maxy - miny) / yard_to_m))

        # 1. Hazards & Green Surfaces
        if local_green_rot:
            for w in local_water_rot:
                if w.is_empty: continue
                try:
                    x_w, y_w = w.exterior.xy
                    ax_green.fill(x_w, y_w, color='#a0c4ff', zorder=1)
                    ax_green.plot(x_w, y_w, color='#4a80cc', linewidth=1.0, zorder=1)
                except: pass
                    
            for b in local_bunkers_rot:
                if b.is_empty: continue
                try:
                    x_b, y_b = b.exterior.xy
                    ax_green.fill(x_b, y_b, color='#e5dacc', zorder=1.5)
                    ax_green.plot(x_b, y_b, color='#b0b0b0', linewidth=0.8, zorder=1.5)
                except: pass
                    
            x_f, y_f = fringe_rot.exterior.xy
            ax_green.fill(x_f, y_f, color='white', zorder=1)
            ax_green.plot(x_f, y_f, color='#777777', linewidth=0.9, linestyle='--', zorder=2.5)
            
            x_g, y_g = local_green_rot.exterior.xy
            ax_green.fill(x_g, y_g, color='white', zorder=1.8)
            ax_green.plot(x_g, y_g, color='#3a8c54', linewidth=2.4, zorder=2.5)

        # 2. Grid & Perimeter Depth Labels
        if local_green_rot:
            start_ny1 = math.floor((y_bottom - miny) / grid_1yd_m)
            end_ny1 = math.ceil((y_top - miny) / grid_1yd_m)
            for n in range(start_ny1, end_ny1 + 1):
                y_line = miny + n * grid_1yd_m
                ax_green.plot([all_minx, all_maxx], [y_line, y_line], color='#f0f0f0', linestyle='-', linewidth=0.3, zorder=2.0)
                
            start_ny5 = math.floor((y_bottom - miny) / grid_5yd_m)
            end_ny5 = math.ceil((y_top - miny) / grid_5yd_m)
            for n in range(start_ny5, end_ny5 + 1):
                y_line = miny + n * grid_5yd_m
                ax_green.plot([all_minx, all_maxx], [y_line, y_line], color='#d5d5d5', linestyle='-', linewidth=0.6, zorder=2.1)
                
            start_nx1 = math.floor((all_minx - cx) / grid_1yd_m)
            end_nx1 = math.ceil((all_maxx - cx) / grid_1yd_m)
            for n in range(start_nx1, end_nx1 + 1):
                x_line = cx + n * grid_1yd_m
                ax_green.plot([x_line, x_line], [y_bottom, y_top], color='#f0f0f0', linestyle='-', linewidth=0.3, zorder=2.0)
                
            start_nx5 = math.floor((all_minx - cx) / grid_5yd_m)
            end_nx5 = math.ceil((all_maxx - cx) / grid_5yd_m)
            for n in range(start_nx5, end_nx5 + 1):
                x_line = cx + n * grid_5yd_m
                ax_green.plot([x_line, x_line], [y_bottom, y_top], color='#d5d5d5', linestyle='-', linewidth=0.6, zorder=2.1)
                
            # Depth Labels hugging green boundary tightly
            from shapely.geometry import LineString
            curr_y = miny
            depth_yds = 0
            while curr_y <= maxy + 0.1:
                if depth_yds % 5 == 0 and depth_yds >= 0:
                    hline = LineString([(all_minx, curr_y), (all_maxx, curr_y)])
                    intersection = hline.intersection(local_green_rot)
                    if not intersection.is_empty:
                        min_ix, _, max_ix, _ = intersection.bounds
                        ax_green.text(min_ix - 1.2, curr_y, f"{depth_yds}", va='center', ha='right', fontsize=6.5, color='#444444', fontweight='bold', zorder=11)
                        ax_green.text(max_ix + 1.2, curr_y, f"{depth_yds}", va='center', ha='left', fontsize=6.5, color='#444444', fontweight='bold', zorder=11)
                curr_y += grid_5yd_m
                depth_yds += 5

        # 3. 0.5-ft Contours
        try:
            valid_z = Z_feet[~np.isnan(Z_feet)]
            if len(valid_z) > 0:
                min_z = np.floor(np.nanmin(valid_z) * 2) / 2
                max_z = np.ceil(np.nanmax(valid_z) * 2) / 2
                levels = np.arange(min_z, max_z + 0.5, 0.5)
                if len(levels) > 1:
                    contours = ax_green.contour(X_rot, Y_rot, Z_feet, levels=levels, colors='#666666', linewidths=0.6, alpha=0.9, zorder=3)
                    def fmt(x):
                        if x > 0: return f"+{x:.1f}"
                        if x == 0: return "0.0"
                        return f"{x:.1f}"
                    ax_green.clabel(contours, inline=True, fontsize=5.5, fmt=fmt, colors='#444444')
        except Exception as e:
            print("Contour error:", e)
        
        # 4. Dense Downhill Slope Arrows (Quiver)
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
            ax_green.quiver(pg_x, pg_y, pg_u, pg_v, color=colors, 
                            angles='xy', scale_units='xy', scale=0.66,
                            headwidth=3, headlength=3, width=0.0035, 
                            pivot='mid', zorder=4)
            
            text_step = 8
            pt_x = X_rot[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_y = Y_rot[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_u = norm_gx[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_v = norm_gy[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_s = slope_pct[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_c = [self._get_slope_color(s) for s in pt_s]
            
            for ix, iy, iu, iv, islope, c in zip(pt_x, pt_y, pt_u, pt_v, pt_s, pt_c):
                ax_green.text(ix - iu*0.5, iy - iv*0.5, f"{islope:.1f}", 
                              fontsize=6, color='#111111', fontweight='bold', ha='center', va='center', zorder=5)
                        
        pf_x = X_rot[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_y = Y_rot[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_u = norm_gx[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_v = norm_gy[::step, ::step][plot_mask_fringe[::step, ::step]]
        
        if len(pf_x) > 0:
            ax_green.quiver(pf_x, pf_y, pf_u, pf_v, color='#d05090', alpha=0.5,
                            angles='xy', scale_units='xy', scale=0.66,
                            headwidth=3, headlength=3, width=0.0035, 
                            pivot='mid', zorder=4)

        # 5. Compass, Course Title, and Total Depth
        compass_angle_rad = np.radians(approach_angle_deg + 90)
        
        if local_green_rot:
            ax_green.set_xlim(all_minx, all_maxx)
            ax_green.set_ylim(y_bottom, y_top)
            
            # Compass & Title (Top Left)
            cx_comp = all_minx + 5.5
            cy_comp = y_top - 6.0
            
            c, s = np.cos(compass_angle_rad), np.sin(compass_angle_rad)
            def rot_pt(px, py): return (cx_comp + px*c - py*s, cy_comp + px*s + py*c)
            
            p1 = rot_pt(0, 1.8)      # Tip
            p2 = rot_pt(-0.9, -1.1)  # Left base
            p3 = rot_pt(0.9, -1.1)   # Right base
            
            ax_green.add_patch(patches.Polygon([p1, p2, p3], facecolor='#222222', edgecolor='none', zorder=12))
            
            nx, ny = rot_pt(0, 2.9)
            ax_green.text(nx, ny, 'N', fontsize=9, fontweight='bold', ha='center', va='center', color='#222222', rotation=approach_angle_deg, zorder=12)
            
            c_clean = course_name.replace(' Golf Course', '').replace(' Golf Club', '')
            ax_green.text(cx_comp + 5.5, cy_comp, f"{c_clean}\nGOLF CLUB", 
                          fontsize=9, fontweight='bold', ha='left', va='center', color='#111111', zorder=11)
                    
            # Total Depth Top Right
            ax_green.text(all_maxx - 3.0, y_top - 5.0, f"{total_depth}", 
                          fontsize=22, fontweight='bold', ha='right', va='center', color='#222222', zorder=11)
            ax_green.text(all_maxx - 3.0, y_top - 9.0, "YDS DEPTH", 
                          fontsize=6, fontweight='bold', ha='right', va='center', color='#777777', zorder=11)
            
            # Horizontal 10-Cell Legend Bar right above divider
            legend_colors = ['#56B4E9', '#0072B2', '#009E73', '#52B788', '#2D6A4F', '#E69F00', '#D55E00', '#CC3333', '#990000', '#882255']
            legend_labels = ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9+']
            
            bar_w = (all_maxx - all_minx - 6.0) / 10
            bar_y = y_bottom + 1.8
            for i, (c_col, l_lbl) in enumerate(zip(legend_colors, legend_labels)):
                rect_leg = patches.Rectangle((all_minx + 3.0 + i*bar_w, bar_y), bar_w, 2.0, facecolor=c_col, edgecolor='#333333', linewidth=0.4, zorder=11)
                ax_green.add_patch(rect_leg)
                ax_green.text(all_minx + 3.0 + i*bar_w + bar_w/2, bar_y - 0.7, l_lbl, fontsize=5.5, ha='center', va='top', fontweight='bold', color='#333333', zorder=11)
                
        ax_green.set_aspect('equal', 'box')
        ax_green.set_xticks([])
        ax_green.set_yticks([])
        ax_green.spines['top'].set_visible(False)
        ax_green.spines['right'].set_visible(False)
        ax_green.spines['bottom'].set_visible(False)
        ax_green.spines['left'].set_visible(False)
        ax_green.set_facecolor('#ffffff')
        
        # 6. Outer Border & Horizontal Divider Line
        rect = plt.Rectangle((0, 0), 1, 1, transform=fig.transFigure, linewidth=6, edgecolor='#5c805c', facecolor='none', zorder=25)
        fig.patches.append(rect)
        
        # Horizontal divider separating map from notes section
        line = plt.Line2D((0, 1), (0.40, 0.40), transform=fig.transFigure, color='#5c805c', linewidth=2.0, zorder=25)
        fig.lines.append(line)
        
        # 7. Notes Section (Bottom 40%)
        ax_notes = fig.add_axes([0, 0.0, 1, 0.40])
        ax_notes.set_xlim(0, 1)
        ax_notes.set_ylim(0, 1)
        ax_notes.axis('off')
        
        # Notes Header & Hole Info
        ax_notes.text(0.08, 0.92, 'NOTES', fontsize=11, fontweight='bold', color='#888888', transform=ax_notes.transAxes)
        ax_notes.text(0.92, 0.92, f"HOLE {hole_num}", fontsize=18, fontweight='bold', ha='right', va='top', color='#222222', transform=ax_notes.transAxes)
        ax_notes.text(0.92, 0.81, f"PAR {par}  |  {yardage} YDS", fontsize=10, fontweight='bold', ha='right', va='top', color='#27ae60', transform=ax_notes.transAxes)
        
        # Ruled Horizontal Lines for Caddie / Player Notes
        for ly in np.linspace(0.24, 0.76, 7):
            ax_notes.plot([0.08, 0.92], [ly, ly], color='#e2e8f0', linewidth=1.0, transform=ax_notes.transAxes)
            
        # Footer Badges (Bottom Circles)
        c_left = patches.Circle((0.15, 0.12), 0.07, facecolor='white', edgecolor='#5c805c', linewidth=1.4, transform=ax_notes.transAxes, zorder=12)
        ax_notes.add_patch(c_left)
        ax_notes.text(0.15, 0.14, f"PAR {par}", fontsize=8, fontweight='bold', ha='center', va='center', color='#222222', transform=ax_notes.transAxes, zorder=13)
        ax_notes.text(0.15, 0.09, f"{yardage} YDS", fontsize=6.5, fontweight='bold', ha='center', va='center', color='#27ae60', transform=ax_notes.transAxes, zorder=13)
        
        c_right = patches.Circle((0.85, 0.12), 0.07, facecolor='white', edgecolor='#5c805c', linewidth=1.4, transform=ax_notes.transAxes, zorder=12)
        ax_notes.add_patch(c_right)
        ax_notes.text(0.85, 0.12, f"{hole_num}", fontsize=16, fontweight='bold', ha='center', va='center', color='#222222', transform=ax_notes.transAxes, zorder=13)
        
        plt.subplots_adjust(left=0, right=1, bottom=0, top=1)
        
        # Save Outputs
        result = {}
        if self.output_path:
            plt.savefig(self.output_path, facecolor='white', dpi=300)
            
        buf_png = io.BytesIO()
        plt.savefig(buf_png, format='png', facecolor='white', dpi=300)
        buf_png.seek(0)
        result['png_bytes'] = buf_png.getvalue()
        
        buf_svg = io.BytesIO()
        plt.savefig(buf_svg, format='svg', facecolor='white')
        buf_svg.seek(0)
        result['svg_str'] = buf_svg.getvalue().decode('utf-8')
        
        plt.close(fig)
        return result
