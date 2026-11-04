export interface WatchedMoment {
  atS: number;
  closedBeats: readonly string[];
  hasScene: boolean;
}

export function isLessonDone(_moments: readonly WatchedMoment[]): boolean {
  return true;
}
