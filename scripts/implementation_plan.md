# Phase 1: Automated Golf Yardage & Green Contour Book Generator

This plan outlines the architecture and implementation for an automated Python script that queries OpenStreetMap, processes a USGS 1-meter DEM, and generates a Tour-style golf green contour map.

## Proposed Architecture

We will divide the project into modular Python files for maintainability.

### Dependencies & Setup
**`requirements.txt`**
Contains the necessary packages:
- `requests` (for Overpass API querying)
- `rasterio` (for GeoTIFF loading and reprojection)
- `geopandas`, `shapely` (for spatial operations and UTM zone handling)
- `numpy`, `scipy` (for gradient/slope math)
- `matplotlib` (for generating the 4.25x7 in plot)

### Data Fetching
**`src/osm_client.py`**
- Take a `course_name, city, state` and resolve its OpenStreetMap bounding box/area.
- Query the Overpass API for `leisure=golf_course` matching the name.
- Query inside that course for `golf=hole` with `ref=1`.
- Extract the polygon tagged `golf=green` and the point tagged `golf=tee`.
- Return the geometries as standard `shapely` objects.

### Topography Processing
**`src/dem_processor.py`**
- Open a user-provided USGS 1-meter DEM GeoTIFF.
- Automatically determine the correct local UTM zone for the green's coordinates.
- Reproject the DEM and the green polygon to this UTM projection (so distances are in meters).
- Mask and crop the elevation array strictly to the green polygon.
- Compute the 2D gradient, slope percentage, and aspect angle (fall line).
- Convert elevation values to feet to facilitate 6-inch (0.5 ft) contour intervals.

### Visualization
**`src/plotter.py`**
- Create a `matplotlib` figure sized strictly to `4.25 x 7` inches.
- Plot the green boundary.
- Generate and plot contour lines at 6-inch intervals based on the masked elevation array.
- Overlay directional slope arrows (fall line) using a `quiver` plot, pointing downhill.
- Format the plot to resemble a Tour-style yardage book (clean aesthetics, compass/north arrow, minimal axes).

### Orchestration
**`main.py`**
- Accept input parameters (Course name, location, path to DEM).
- Run the OSM query to get the geometries.
- Pass the geometries and DEM path to the DEM processor.
- Pass the calculated metrics to the plotter and save the resulting image to disk (e.g., `hole_1_green.pdf` or `png`).

## Open Questions
1. Should we use `conda` or `pip` (requirements.txt) to manage spatial dependencies like `rasterio` and `geopandas`? (They are often easier to install via `conda`).
2. Do you have a specific testing location (Course, City, State) and an accompanying DEM file in mind to test with right now, or should we use placeholders?
