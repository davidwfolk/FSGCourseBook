export interface HoleMeta {
  holeNumber: number;
  par: number;
  handicap?: number;
  greenSlopeDir: number;
  greenSlopePct: number;
  courseName: string;
}

export interface HoleFeature {
  id: string;
  type: string; // 'tee' | 'green' | 'fairway' | 'bunker' | 'water' | 'centerline' | 'target' | 'tree' | 'ridge' | 'ob' | 'crop'
  coords: any;
  props?: Record<string, any>;
  center?: [number, number];
}

export interface HoleData {
  meta: HoleMeta;
  lidarGrid: any | null;
  features: HoleFeature[];
}

export type CourseHolesStore = Record<number, HoleData>;
