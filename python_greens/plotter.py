import io
import math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.path import Path
from matplotlib.patches import PathPatch
from matplotlib.colors import LinearSegmentedColormap, ListedColormap, BoundaryNorm
from shapely.geometry import Point as ShPoint, Polygon, LineString
from shapely.affinity import rotate
import shapely

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
        Renders a Tour USGA 1:480 3-Panel Green Complex Booklet Page (540x1512 equivalent).
        Layout:
          - Top Panel (y: 0..380px): Green Elevation Profile (Elevation colormap + contours + break arrows)
          - Middle Panel (y: 380..760px): FSG Slope Heatmap (Okabe-Ito 10-step slope colormap + contours + arrows extending 3.5y into fringe)
          - Bottom Panel (y: 760..1512px): USGA 1:480 Vector Grid + Notes + arrows extending 3.5y into fringe
        """
        Z_feet = dem_data['elevation_feet'].copy()
        X = dem_data['X']
        Y = dem_data['Y']
        
        local_green = dem_data.get('local_green_poly', None)
        local_bunkers = dem_data.get('local_bunkers', [])
        local_water = dem_data.get('local_water', [])
        hole_line = dem_data.get('hole_line')

        yard_to_m = 0.9144
        if hole_line and (not yardage or yardage == 350):
            try:
                calc_yds = int(round(hole_line.length / yard_to_m))
                if calc_yds > 50:
                    yardage = calc_yds
            except:
                pass

        # Figure setup: exactly 5.4 x 15.12 inches at 100 dpi = 540x1512 pixels
        fig = plt.figure(figsize=(5.4, 15.12), dpi=100)
        
        cx, cy = 20.0, 20.0
        if local_green:
            cx, cy = local_green.centroid.x, local_green.centroid.y

        # True Cartesian vector from approach origin (Pivot/Tee) to Green centroid:
        # Ensures that Green is ALWAYS at the top and fairway approach ALWAYS enters from bottom,
        # regardless of compass bearing (fixes upside-down South-facing holes).
        if hole_line and len(hole_line.coords) >= 2:
            p_app = hole_line.coords[0]
            vx = cx - p_app[0]
            vy = cy - p_app[1]
            L = math.hypot(vx, vy)
            if L > 0.001:
                ux = vx / L
                uy = vy / L
            else:
                ux, uy = 0.0, 1.0
        else:
            rad = math.radians(approach_angle_deg)
            ux = math.sin(rad)
            uy = math.cos(rad)

        # In Matplotlib (+Y is up):
        # We rotate (ux, uy) so that it points straight UP along +Y (polar angle pi/2).
        # Rotation angle delta_theta = pi/2 - arctan2(uy, ux)
        # cos(delta_theta) = uy, sin(delta_theta) = ux
        X_rot = cx + (X - cx) * uy - (Y - cy) * ux
        Y_rot = cy + (X - cx) * ux + (Y - cy) * uy

        gx_rot = down_gx * uy - down_gy * ux
        gy_rot = down_gx * ux + down_gy * uy

        rot_deg = float(math.degrees(math.pi / 2 - math.atan2(uy, ux)))

        local_green_rot = None
        local_bunkers_rot = []
        local_water_rot = []
        fringe_rot = None
        fringe_arrow_rot = None

        if local_green:
            local_green_rot = smooth_polygon(rotate(local_green, rot_deg, origin=(cx, cy), use_radians=False))
            # 1.2m dashed fringe boundary for collar outline
            fringe_rot = local_green_rot.buffer(1.2)
            # CRITICAL: 3.2m (~3.5 yards) fringe boundary for fall-line arrows off the green
            fringe_arrow_rot = local_green_rot.buffer(3.2)
            
            for b in local_bunkers:
                try:
                    local_bunkers_rot.append(smooth_polygon(rotate(b, rot_deg, origin=(cx, cy), use_radians=False)))
                except: pass
            for w in local_water:
                try:
                    local_water_rot.append(smooth_polygon(rotate(w, rot_deg, origin=(cx, cy), use_radians=False)))
                except: pass

        # USGA 1:480 Scale dimensions:
        # Canvas 540px wide at 10.8 px/yd = 50 yards = 45.72 meters
        base_width_m = 45.72
        # Panels 1 and 2 are 380px tall -> 380 / 540 * 45.72 = 32.176 meters
        base_height_m_p12 = base_width_m * (380.0 / 540.0)
        # Panel 3 is 500px tall -> 500 / 540 * 45.72 = 42.3333 meters
        base_height_m_p3 = base_width_m * (500.0 / 540.0)
        
        all_minx = cx - base_width_m / 2
        all_maxx = cx + base_width_m / 2
        y_center = cy
        
        total_depth = 28
        if local_green_rot:
            minx, miny, maxx, maxy = local_green_rot.bounds
            total_depth = int(round((maxy - miny) / yard_to_m))
            y_center = (miny + maxy) / 2
            
        y_bottom_p12 = y_center - base_height_m_p12 * 0.48
        y_top_p12 = y_center + base_height_m_p12 * 0.52

        y_bottom_p3 = y_center - base_height_m_p3 * 0.48
        y_top_p3 = y_center + base_height_m_p3 * 0.52

        # Masks for arrows & surfaces
        mask_green = np.zeros(X_rot.shape, dtype=bool)
        mask_fringe_arrows = np.zeros(X_rot.shape, dtype=bool)
        if local_green_rot:
            pts = shapely.points(X_rot.ravel(), Y_rot.ravel())
            mask_green = shapely.contains(local_green_rot, pts).reshape(X_rot.shape)
            mask_fringe_full = shapely.contains(fringe_arrow_rot, pts).reshape(X_rot.shape)
            mask_fringe_arrows = mask_fringe_full & (~mask_green)

        # Quiver vector normalization
        mag = np.sqrt(gx_rot**2 + gy_rot**2)
        mag[mag == 0] = 1e-10
        norm_gx = gx_rot / mag
        norm_gy = gy_rot / mag

        valid_slope = slope_pct > 0.4
        plot_mask_green = mask_green & valid_slope
        plot_mask_fringe = mask_fringe_arrows & valid_slope

        step = 2
        pg_x = X_rot[::step, ::step][plot_mask_green[::step, ::step]]
        pg_y = Y_rot[::step, ::step][plot_mask_green[::step, ::step]]
        pg_u = norm_gx[::step, ::step][plot_mask_green[::step, ::step]]
        pg_v = norm_gy[::step, ::step][plot_mask_green[::step, ::step]]
        pg_s = slope_pct[::step, ::step][plot_mask_green[::step, ::step]]

        pf_x = X_rot[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_y = Y_rot[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_u = norm_gx[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_v = norm_gy[::step, ::step][plot_mask_fringe[::step, ::step]]
        pf_s = slope_pct[::step, ::step][plot_mask_fringe[::step, ::step]]

        okabe_colors = ['#56B4E9', '#0072B2', '#009E73', '#52B788', '#2D6A4F', '#E69F00', '#D55E00', '#CC3333', '#990000', '#882255']
        okabe_bounds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20]
        okabe_cmap = ListedColormap(okabe_colors)
        okabe_norm = BoundaryNorm(okabe_bounds, okabe_cmap.N)
        elev_cmap = LinearSegmentedColormap.from_list('elev_profile', ['#3b82f6', '#06b6d4', '#4ade80'])

        # Contour levels (0.5 ft)
        valid_z = Z_feet[mask_green]
        if len(valid_z) > 0:
            min_z = np.floor(np.nanmin(valid_z) * 2) / 2
            max_z = np.ceil(np.nanmax(valid_z) * 2) / 2
            levels = np.arange(min_z, max_z + 0.5, 0.5)
        else:
            levels = np.arange(-3.0, 3.5, 0.5)

        # ==============================================================
        # PANEL 1: ELEVATION PROFILE (Top: y = 0.7487 to 1.0)
        # ==============================================================
        ax_p1 = fig.add_axes([0, 0.7487, 1, 0.2513])
        ax_p1.set_facecolor('#0a1120')
        ax_p1.set_aspect('equal')
        ax_p1.set_xlim(all_minx, all_maxx)
        ax_p1.set_ylim(y_bottom_p12, y_top_p12)
        ax_p1.axis('off')

        # Hazards
        for w in local_water_rot:
            if not w.is_empty:
                xw, yw = w.exterior.xy
                ax_p1.fill(xw, yw, color='#a0c4ff', zorder=1)
                ax_p1.plot(xw, yw, color='#4a80cc', linewidth=1.0, zorder=1)
        for b in local_bunkers_rot:
            if not b.is_empty:
                xb, yb = b.exterior.xy
                ax_p1.fill(xb, yb, color='#e5dacc', zorder=1)
                ax_p1.plot(xb, yb, color='#b0b0b0', linewidth=0.8, zorder=1)

        # Elevation Mesh inside green
        if local_green_rot:
            gx, gy = local_green_rot.exterior.xy
            clip_patch_p1 = PathPatch(Path(np.column_stack([gx, gy])), transform=ax_p1.transData, facecolor='none')
            ax_p1.add_patch(clip_patch_p1)

            try:
                im_p1 = ax_p1.pcolormesh(X_rot, Y_rot, Z_feet, shading='gouraud', cmap=elev_cmap, alpha=0.9, zorder=2)
                im_p1.set_clip_path(clip_patch_p1)

                cs_p1 = ax_p1.contour(X_rot, Y_rot, Z_feet, levels=levels, colors='white', linewidths=0.6, alpha=0.7, zorder=3)
                for c in cs_p1.collections:
                    c.set_clip_path(clip_patch_p1)
            except: pass

            # 1.2m dashed fringe collar
            if fringe_rot and not fringe_rot.is_empty:
                xf, yf = fringe_rot.exterior.xy
                ax_p1.plot(xf, yf, color='#777777', linestyle=(0, (4, 4)), linewidth=0.9, zorder=17)

            # Smooth green perimeter outline
            ax_p1.plot(gx, gy, color='#3a8c54', linewidth=2.0, zorder=18)

        # Dark navy downhill fall-line arrows
        if len(pg_x) > 0:
            ax_p1.quiver(pg_x, pg_y, pg_u, pg_v, color='#1e3a8a',
                         angles='xy', scale_units='xy', scale=0.7,
                         headwidth=3.2, headlength=3.2, width=0.0035,
                         pivot='mid', zorder=5)

        # Title & Subtitle
        ax_p1.text(all_minx + 2.0, y_top_p12 - 2.8, f"HOLE {hole_num} — GREEN ELEVATION PROFILE",
                   fontsize=9.5, fontweight='bold', color='white', zorder=10)
        ax_p1.text(all_maxx - 2.0, y_top_p12 - 2.8, 'USGA 1:480 SCALE (1" = 40 FT)',
                   fontsize=7.5, fontweight='bold', color='#38bdf8', ha='right', zorder=10)

        # Low <---> High Legend Bar
        bar_w = 11.0
        bar_x = all_maxx - bar_w - 2.0
        bar_y = y_bottom_p12 + 1.6
        rect_p1 = patches.Rectangle((bar_x, bar_y), bar_w, 1.4, facecolor='#06b6d4', edgecolor='white', linewidth=0.8, zorder=10)
        ax_p1.add_patch(rect_p1)
        ax_p1.text(bar_x, bar_y + 1.8, "LOW", fontsize=6, fontweight='bold', color='white', ha='left', zorder=10)
        ax_p1.text(bar_x + bar_w, bar_y + 1.8, "HIGH", fontsize=6, fontweight='bold', color='white', ha='right', zorder=10)

        # Divider at bottom of Panel 1
        line_div1 = plt.Line2D((0, 1), (0.7487, 0.7487), transform=fig.transFigure, color='#334155', linewidth=1.5, zorder=30)
        fig.lines.append(line_div1)

        # ==============================================================
        # PANEL 2: FSG SLOPE HEATMAP (Middle: y = 0.4974 to 0.7487)
        # ==============================================================
        ax_p2 = fig.add_axes([0, 0.4974, 1, 0.2513])
        ax_p2.set_facecolor('#0a1120')
        ax_p2.set_aspect('equal')
        ax_p2.set_xlim(all_minx, all_maxx)
        ax_p2.set_ylim(y_bottom_p12, y_top_p12)
        ax_p2.axis('off')

        for w in local_water_rot:
            if not w.is_empty:
                xw, yw = w.exterior.xy
                ax_p2.fill(xw, yw, color='#a0c4ff', zorder=1)
                ax_p2.plot(xw, yw, color='#4a80cc', linewidth=1.0, zorder=1)
        for b in local_bunkers_rot:
            if not b.is_empty:
                xb, yb = b.exterior.xy
                ax_p2.fill(xb, yb, color='#e5dacc', zorder=1)
                ax_p2.plot(xb, yb, color='#b0b0b0', linewidth=0.8, zorder=1)

        # Okabe-Ito Heatmap inside green
        if local_green_rot:
            gx, gy = local_green_rot.exterior.xy
            clip_patch_p2 = PathPatch(Path(np.column_stack([gx, gy])), transform=ax_p2.transData, facecolor='none')
            ax_p2.add_patch(clip_patch_p2)

            try:
                im_p2 = ax_p2.pcolormesh(X_rot, Y_rot, slope_pct, shading='gouraud', cmap=okabe_cmap, norm=okabe_norm, alpha=0.92, zorder=2)
                im_p2.set_clip_path(clip_patch_p2)

                cs_p2 = ax_p2.contour(X_rot, Y_rot, Z_feet, levels=levels, colors='white', linewidths=0.8, alpha=0.85, zorder=3)
                for c in cs_p2.collections:
                    c.set_clip_path(clip_patch_p2)
            except: pass

            # 1.2m dashed fringe collar
            if fringe_rot and not fringe_rot.is_empty:
                xf, yf = fringe_rot.exterior.xy
                ax_p2.plot(xf, yf, color='#777777', linestyle=(0, (4, 4)), linewidth=0.9, zorder=17)

            # Smooth green perimeter outline
            ax_p2.plot(gx, gy, color='#3a8c54', linewidth=2.0, zorder=18)

        # Bold white break arrows inside green (alpha = 1.0)
        if len(pg_x) > 0:
            ax_p2.quiver(pg_x, pg_y, pg_u, pg_v, color='white',
                         angles='xy', scale_units='xy', scale=0.7,
                         headwidth=3.2, headlength=3.2, width=0.0035,
                         pivot='mid', zorder=5)

        # CRITICAL: Fringe break arrows extending 3.5 yards outside green (alpha = 0.5)
        if len(pf_x) > 0:
            ax_p2.quiver(pf_x, pf_y, pf_u, pf_v, color='white', alpha=0.5,
                         angles='xy', scale_units='xy', scale=0.7,
                         headwidth=3.2, headlength=3.2, width=0.0035,
                         pivot='mid', zorder=5)

        # Title: HOLE X - FSG SLOPE HEATMAP
        ax_p2.text(all_minx + 2.0, y_top_p12 - 2.8, f"HOLE {hole_num} - FSG SLOPE HEATMAP",
                   fontsize=9.5, fontweight='bold', color='white', zorder=10)

        # Depth Badge Top Right
        badge_w = 9.5
        badge_x = all_maxx - badge_w - 2.0
        badge_y = y_top_p12 - 4.2
        rect_badge = patches.FancyBboxPatch((badge_x, badge_y), badge_w, 2.2, boxstyle="round,pad=0.3",
                                            facecolor='#0f172a', edgecolor='#f97316', linewidth=1.2, zorder=10)
        ax_p2.add_patch(rect_badge)
        ax_p2.text(badge_x + badge_w / 2, badge_y + 1.1, f"DEPTH: {total_depth} YDS",
                   fontsize=7, fontweight='bold', color='white', ha='center', va='center', zorder=11)

        # 10-Color Legend Bar at bottom of Panel 2
        leg_bar_w = (all_maxx - all_minx - 4.0) / 10
        leg_bar_y = y_bottom_p12 + 1.6
        okabe_labels = ['0-1', '1-2', '2-3', '3-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9+']
        for i, (col, lbl) in enumerate(zip(okabe_colors, okabe_labels)):
            bx = all_minx + 2.0 + i * leg_bar_w
            rect_l = patches.Rectangle((bx, leg_bar_y), leg_bar_w, 1.3, facecolor=col, edgecolor='#1e293b', linewidth=0.5, zorder=10)
            ax_p2.add_patch(rect_l)
            ax_p2.text(bx + leg_bar_w / 2, leg_bar_y - 0.7, lbl, fontsize=5.5, fontweight='bold', color='#cbd5e1', ha='center', va='top', zorder=10)

        # Divider at bottom of Panel 2
        line_div2 = plt.Line2D((0, 1), (0.4974, 0.4974), transform=fig.transFigure, color='#5c805c', linewidth=2.0, zorder=30)
        fig.lines.append(line_div2)

        # ==============================================================
        # PANEL 3: USGA 1:480 VECTOR GRID (Bottom: y = 0.1667 to 0.4974)
        # ==============================================================
        ax_p3 = fig.add_axes([0, 0.1667, 1, 0.3307])
        ax_p3.set_facecolor('#ffffff')
        ax_p3.set_aspect('equal')
        ax_p3.set_xlim(all_minx, all_maxx)
        ax_p3.set_ylim(y_bottom_p3, y_top_p3)
        ax_p3.axis('off')

        for w in local_water_rot:
            if not w.is_empty:
                xw, yw = w.exterior.xy
                ax_p3.fill(xw, yw, color='#a0c4ff', zorder=1)
                ax_p3.plot(xw, yw, color='#4a80cc', linewidth=1.0, zorder=1)
        for b in local_bunkers_rot:
            if not b.is_empty:
                xb, yb = b.exterior.xy
                ax_p3.fill(xb, yb, color='#e5dacc', zorder=1)
                ax_p3.plot(xb, yb, color='#b0b0b0', linewidth=0.8, zorder=1)

        if local_green_rot:
            # 1.2m dashed fringe collar
            xf, yf = fringe_rot.exterior.xy
            ax_p3.fill(xf, yf, color='white', zorder=1)
            ax_p3.plot(xf, yf, color='#777777', linewidth=0.9, linestyle='--', zorder=2)

            # White green surface with green outline
            xg, yg = local_green_rot.exterior.xy
            ax_p3.fill(xg, yg, color='white', zorder=2)
            ax_p3.plot(xg, yg, color='#3a8c54', linewidth=2.4, zorder=4)

            # 1-yard faint grid and 5-yard crisp grid
            grid_1yd_m = 1 * yard_to_m
            grid_5yd_m = 5 * yard_to_m
            minx_g, miny_g, maxx_g, maxy_g = local_green_rot.bounds

            start_ny1 = math.floor((y_bottom_p3 - miny_g) / grid_1yd_m)
            end_ny1 = math.ceil((y_top_p3 - miny_g) / grid_1yd_m)
            for n in range(start_ny1, end_ny1 + 1):
                y_l = miny_g + n * grid_1yd_m
                ax_p3.plot([all_minx, all_maxx], [y_l, y_l], color='#f0f0f0', linewidth=0.4, zorder=2)

            start_ny5 = math.floor((y_bottom_p3 - miny_g) / grid_5yd_m)
            end_ny5 = math.ceil((y_top_p3 - miny_g) / grid_5yd_m)
            for n in range(start_ny5, end_ny5 + 1):
                y_l = miny_g + n * grid_5yd_m
                ax_p3.plot([all_minx, all_maxx], [y_l, y_l], color='#d5d5d5', linewidth=0.7, zorder=2)

            start_nx1 = math.floor((all_minx - cx) / grid_1yd_m)
            end_nx1 = math.ceil((all_maxx - cx) / grid_1yd_m)
            for n in range(start_nx1, end_nx1 + 1):
                x_l = cx + n * grid_1yd_m
                ax_p3.plot([x_l, x_l], [y_bottom_p3, y_top_p3], color='#f0f0f0', linewidth=0.4, zorder=2)

            start_nx5 = math.floor((all_minx - cx) / grid_5yd_m)
            end_nx5 = math.ceil((all_maxx - cx) / grid_5yd_m)
            for n in range(start_nx5, end_nx5 + 1):
                x_l = cx + n * grid_5yd_m
                ax_p3.plot([x_l, x_l], [y_bottom_p3, y_top_p3], color='#d5d5d5', linewidth=0.7, zorder=2)

            # Perimeter depth labels hugging green perimeter along every 5-yard line
            curr_y = miny_g
            depth_yds = 0
            while curr_y <= maxy_g + 0.1:
                if depth_yds % 5 == 0 and depth_yds >= 0:
                    hline = LineString([(all_minx, curr_y), (all_maxx, curr_y)])
                    intersection = hline.intersection(local_green_rot)
                    if not intersection.is_empty:
                        min_ix, _, max_ix, _ = intersection.bounds
                        ax_p3.text(min_ix - 0.9, curr_y, f"{depth_yds}", va='center', ha='right', fontsize=6.5, color='#333333', fontweight='bold', zorder=12)
                        ax_p3.text(max_ix + 0.9, curr_y, f"{depth_yds}", va='center', ha='left', fontsize=6.5, color='#333333', fontweight='bold', zorder=12)
                curr_y += grid_5yd_m
                depth_yds += 5

            # 0.5-ft contour lines in #666666
            try:
                clip_patch_p3 = PathPatch(Path(np.column_stack([xg, yg])), transform=ax_p3.transData, facecolor='none', edgecolor='none')
                ax_p3.add_patch(clip_patch_p3)
                cs_p3 = ax_p3.contour(X_rot, Y_rot, Z_feet, levels=levels, colors='#666666', linewidths=0.6, alpha=0.9, zorder=3)
                for c in cs_p3.collections:
                    c.set_clip_path(clip_patch_p3)
            except: pass

        # Dense 2-yard stride fall-line arrows inside green (colored by Okabe-Ito, alpha=1.0)
        colors_green = [self._get_slope_color(s) for s in pg_s]
        if len(pg_x) > 0:
            ax_p3.quiver(pg_x, pg_y, pg_u, pg_v, color=colors_green,
                         angles='xy', scale_units='xy', scale=0.7,
                         headwidth=3.2, headlength=3.2, width=0.0035,
                         pivot='mid', zorder=5)

            # Numeric slope % labels every 8 yards
            text_step = 8
            pt_x = X_rot[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_y = Y_rot[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_u = norm_gx[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_v = norm_gy[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            pt_s = slope_pct[::text_step, ::text_step][plot_mask_green[::text_step, ::text_step]]
            for ix, iy, iu, iv, islope in zip(pt_x, pt_y, pt_u, pt_v, pt_s):
                ax_p3.text(ix - iu * 0.5, iy - iv * 0.5, f"{islope:.1f}",
                           fontsize=6, color='#111111', fontweight='bold', ha='center', va='center', zorder=6)

        # CRITICAL: Fringe fall-line arrows extending 3.5 yards outside green (colored by Okabe-Ito, alpha=0.5)
        colors_fringe = [self._get_slope_color(s) for s in pf_s]
        if len(pf_x) > 0:
            ax_p3.quiver(pf_x, pf_y, pf_u, pf_v, color=colors_fringe, alpha=0.5,
                         angles='xy', scale_units='xy', scale=0.7,
                         headwidth=3.2, headlength=3.2, width=0.0035,
                         pivot='mid', zorder=5)

        # Compass & Course Name Top Left
        cx_comp = all_minx + 4.5
        cy_comp = y_top_p3 - 4.5
        # Compass needle in approach-rotated coordinates:
        # True North unit vector in rotated frame is (-ux, uy)
        def rot_comp(px, py):
            return (cx_comp + px * uy - py * ux, cy_comp + px * ux + py * uy)

        p1_c = rot_comp(0, 1.6)
        p2_c = rot_comp(-0.8, -1.0)
        p3_c = rot_comp(0.8, -1.0)
        ax_p3.add_patch(patches.Polygon([p1_c, p2_c, p3_c], facecolor='#1e293b', edgecolor='none', zorder=12))
        nx_c, ny_c = rot_comp(0, 2.5)
        ax_p3.text(nx_c, ny_c, 'N', fontsize=8, fontweight='bold', ha='center', va='center', color='#1e293b', zorder=12)

        c_clean = course_name.replace(' Golf Course', '').replace(' Golf Club', '').upper()
        ax_p3.text(cx_comp + 4.2, cy_comp, f"{c_clean}\nGOLF CLUB",
                   fontsize=8, fontweight='bold', color='#111111', ha='left', va='center', zorder=12)

        # Total Green Depth Top Right
        ax_p3.text(all_maxx - 2.5, y_top_p3 - 3.5, f"{total_depth}",
                   fontsize=20, fontweight='bold', color='#222222', ha='right', va='center', zorder=12)
        ax_p3.text(all_maxx - 2.5, y_top_p3 - 6.5, "YDS DEPTH",
                   fontsize=6, fontweight='bold', color='#666666', ha='right', va='center', zorder=12)

        # ==============================================================
        # NOTES SECTION (Bottom: y = 0.0 to 0.1667, below y = 1260px)
        # ==============================================================
        line_div3 = plt.Line2D((0, 1), (0.1667, 0.1667), transform=fig.transFigure, color='#5c805c', linewidth=2.0, zorder=30)
        fig.lines.append(line_div3)

        ax_notes = fig.add_axes([0, 0.0, 1, 0.1667])
        ax_notes.set_xlim(0, 1)
        ax_notes.set_ylim(0, 1)
        ax_notes.axis('off')

        ax_notes.text(0.08, 0.88, 'NOTES', fontsize=10, fontweight='bold', color='#888888', transform=ax_notes.transAxes)
        ax_notes.text(0.92, 0.88, f"HOLE {hole_num}", fontsize=16, fontweight='bold', ha='right', va='top', color='#222222', transform=ax_notes.transAxes)
        ax_notes.text(0.92, 0.72, f"PAR {par}  |  {yardage} YDS", fontsize=9.5, fontweight='bold', ha='right', va='top', color='#27ae60', transform=ax_notes.transAxes)

        # Ruled Horizontal Lines
        for ly in np.linspace(0.28, 0.65, 5):
            ax_notes.plot([0.08, 0.92], [ly, ly], color='#e2e8f0', linewidth=1.0, transform=ax_notes.transAxes)

        # Bottom circle badges (aspect-corrected Ellipse for 540x252 axes so they render as true circles)
        c_left = patches.Ellipse((0.15, 0.20), width=0.08, height=0.1714, facecolor='white', edgecolor='#5c805c', linewidth=1.4, transform=ax_notes.transAxes, zorder=12)
        ax_notes.add_patch(c_left)
        ax_notes.text(0.15, 0.23, f"PAR {par}", fontsize=7.5, fontweight='bold', ha='center', va='center', color='#222222', transform=ax_notes.transAxes, zorder=13)
        ax_notes.text(0.15, 0.17, f"{yardage} YDS", fontsize=6, fontweight='bold', ha='center', va='center', color='#27ae60', transform=ax_notes.transAxes, zorder=13)

        c_right = patches.Ellipse((0.85, 0.20), width=0.08, height=0.1714, facecolor='white', edgecolor='#5c805c', linewidth=1.4, transform=ax_notes.transAxes, zorder=12)
        ax_notes.add_patch(c_right)
        ax_notes.text(0.85, 0.20, f"{hole_num}", fontsize=14, fontweight='bold', ha='center', va='center', color='#222222', transform=ax_notes.transAxes, zorder=13)

        # Outer green border around entire 3-panel sheet
        rect_border = plt.Rectangle((0, 0), 1, 1, transform=fig.transFigure, linewidth=5, edgecolor='#5c805c', facecolor='none', zorder=50)
        fig.patches.append(rect_border)

        plt.subplots_adjust(left=0, right=1, bottom=0, top=1)

        result = {}
        if self.output_path:
            plt.savefig(self.output_path, facecolor='white', dpi=100)
            
        buf_png = io.BytesIO()
        plt.savefig(buf_png, format='png', facecolor='white', dpi=100)
        buf_png.seek(0)
        result['png_bytes'] = buf_png.getvalue()
        result['total_depth'] = total_depth
        
        plt.close(fig)
        return result
