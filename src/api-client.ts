export interface CourseRecord {
  id: string;
  name: string;
  city?: string;
  state?: string;
  center_lat: number;
  center_lon: number;
  osm_raw_r2_key?: string;
  created_at?: string;
  holes_count?: number;
}

export interface HoleRecord {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  handicap?: number;
  yardage: number;
  tee_lat: number;
  tee_lon: number;
  pivot_lat?: number | null;
  pivot_lon?: number | null;
  green_lat: number;
  green_lon: number;
  hole_bearing: number;
  approach_bearing: number;
  green_polygon?: any;
  bunkers_geojson?: any[];
  fairways_geojson?: any[];
  lidar_r2_key?: string;
  features?: any[];
  lidar_grid?: any;
}

export interface YardageBookRecord {
  id: string;
  course_id: string;
  title: string;
  tee_time?: string;
  hole_plans: Record<string, any>;
  pdf_r2_key?: string;
  updated_at?: string;
}

export const apiClient = {
  /**
   * Fetch all saved courses from Neon Postgres
   */
  async getCourses(): Promise<CourseRecord[]> {
    try {
      const res = await fetch('/api/courses');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.courses || [];
    } catch (err) {
      console.warn('apiClient.getCourses failed:', err);
      return [];
    }
  },

  /**
   * Fetch a single course and its 18 holes from Neon Postgres
   * @param courseId UUID or course name
   * @param syncOsm boolean trigger to re-sync with Overpass OSM data
   * @param hardReset boolean flag to hard reset (wipe course_holes before re-sync)
   */
  async getCourse(
    courseId: string,
    syncOsm: boolean = false,
    hardReset: boolean = false
  ): Promise<{ course: CourseRecord; holes: HoleRecord[]; yardage_book?: YardageBookRecord } | null> {
    try {
      const url = `/api/courses?id=${encodeURIComponent(courseId)}${syncOsm ? '&sync_osm=true' : ''}${hardReset ? '&hard_reset=true' : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      return await res.json();
    } catch (err) {
      console.error('apiClient.getCourse failed:', err);
      throw err;
    }
  },

  /**
   * Fetch 7x7 real elevation grid for green complex
   */
  async getGreenElevationGrid(lat: number, lon: number, courseId?: string, holeNumber?: number): Promise<any | null> {
    try {
      let url = `/api/elevation?lat=${lat}&lon=${lon}`;
      if (courseId) url += `&course_id=${encodeURIComponent(courseId)}`;
      if (holeNumber) url += `&hole_number=${holeNumber}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.grid || null;
    } catch (err) {
      console.warn('apiClient.getGreenElevationGrid failed:', err);
      return null;
    }
  },

  /**
   * Uploads/imports OSM course data into Neon Postgres, running spatial join for holes 1-18
   */
  async saveCourseWithOsm(payload: {
    name: string;
    city?: string;
    state?: string;
    center_lat?: number;
    center_lon?: number;
    osmData?: any;
    holes?: any[];
    osm_raw_r2_key?: string;
    hardReset?: boolean;
  }): Promise<{ success: boolean; course: CourseRecord; holes: HoleRecord[] }> {
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Persists single-hole changes (coordinates, bearing, features, plans) to Neon Postgres
   */
  async saveHole(holeData: Partial<HoleRecord> & { course_id: string; hole_number: number; hole_plan?: any }): Promise<{ success: boolean; hole: HoleRecord }> {
    const res = await fetch('/api/holes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(holeData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Gets a presigned Cloudflare R2 URL for direct uploads/downloads
   */
  async getPresignedUrl(key: string, operation: 'put' | 'get' = 'put', contentType?: string): Promise<{ url: string; key: string; bucket: string }> {
    const res = await fetch('/api/r2-presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, operation, contentType })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  },

  /**
   * Direct upload helper to Cloudflare R2
   */
  async uploadToR2(key: string, data: Blob | string, contentType: string = 'application/octet-stream'): Promise<boolean> {
    const { url } = await this.getPresignedUrl(key, 'put', contentType);
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: data
    });
    return putRes.ok;
  }
};
