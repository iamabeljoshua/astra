import type { STUDENT_INTEREST_LABELS } from '../strings';
import { STROKE } from './drawings';

type InterestName = keyof typeof STUDENT_INTEREST_LABELS;

// One unit is one pixel on a 21-pixel box, so a straight stroke on a half unit stays sharp on any screen.
const INTEREST_DRAWING_PATHS: Record<InterestName, readonly string[]> = {
  basketball: ['M2 10.5 a8.5 8.5 0 1 0 17 0 a8.5 8.5 0 1 0 -17 0', 'M2 10.5 H19', 'M10.5 2 V19', 'M4.6 4.4 C7.4 7 7.4 14 4.6 16.6', 'M16.4 4.4 C13.6 7 13.6 14 16.4 16.6'],
  football: ['M2 10.5 a8.5 8.5 0 1 0 17 0 a8.5 8.5 0 1 0 -17 0', 'M10.5 7.3 L13.54 9.51 L12.38 13.09 L8.62 13.09 L7.46 9.51 Z', 'M10.5 7.3 V2', 'M13.54 9.51 L18.58 7.87', 'M12.38 13.09 L15.5 17.38', 'M8.62 13.09 L5.5 17.38', 'M7.46 9.51 L2.42 7.87'],
  movies: ['M3.5 9.5 H17.5 V17.5 H3.5 Z', 'M3.5 9.5 L2.8 6.5 L16.4 3.3 L17.1 6.3 L3.5 9.5', 'M7 5.5 L8.6 8', 'M11.5 4.5 L13.1 7'],
  gaming: ['M4.5 6.5 H16.5 L19.5 15.5 H15.5 L13.5 12.5 H7.5 L5.5 15.5 H1.5 Z', 'M6.5 8 V11 M5 9.5 H8', 'M13.5 10 h0.01', 'M15.5 8 h0.01'],
  music: ['M7.5 15.5 V5.5 L17.5 3.5 V13.5', 'M7.5 15.5 a2.75 2.25 0 1 1 -5.5 0 a2.75 2.25 0 1 1 5.5 0', 'M17.5 13.5 a2.75 2.25 0 1 1 -5.5 0 a2.75 2.25 0 1 1 5.5 0'],
  art: ['M3.5 2.5 H17.5 V13.5 H3.5 Z', 'M6.5 10.5 C8.5 5.5 11 11.5 14.5 6.5', 'M7 13.5 L5 18.5', 'M14 13.5 L16 18.5'],
  space: ['M6 10.5 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0', 'M6.7 8.2 C3.2 10.2 1.2 12.8 2 14 C3 15.4 8 14.4 12.5 12 C17 9.6 20.2 7 19 5.6 C18.3 4.8 16.4 5.2 14.2 6.4'],
  cars: ['M4 14.5 H2 V11 L5.5 10 L8 6.5 H13.5 L16.5 10 L19 11 V14.5 H17', 'M8 14.5 H13', 'M4 14.5 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', 'M13 14.5 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', 'M5.5 10 H16.5'],
  cooking: ['M4.5 9.5 H16.5 V15.5 A2 2 0 0 1 14.5 17.5 H6.5 A2 2 0 0 1 4.5 15.5 Z', 'M4.5 11.5 H2.5', 'M16.5 11.5 H18.5', 'M8.5 6.5 C8 5.3 9 4.2 8.5 3', 'M12.5 6.5 C12 5.3 13 4.2 12.5 3'],
  fashion: ['M8.5 5 A2 2 0 1 1 11.5 6.7 C10.8 7.1 10.5 7.6 10.5 8.5', 'M10.5 8.5 L2.5 14 C1.7 14.7 2 16 3 16 H18 C19 16 19.3 14.7 18.5 14 L10.5 8.5'],
  coding: ['M6.5 5.5 L2 10.5 L6.5 15.5', 'M14.5 5.5 L19 10.5 L14.5 15.5', 'M12.5 3.5 L8.5 17.5'],
  history: ['M10.5 2.5 L18.5 7.5 H2.5 Z', 'M5 9.5 V15.5 M10.5 9.5 V15.5 M16 9.5 V15.5', 'M3 17.5 H18'],
};

export function InterestDrawing({ interest }: { interest: InterestName }) {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" className="thumb-strokes size-chip-picture flex-none">
      {INTEREST_DRAWING_PATHS[interest].map((path) => (
        <path key={path} d={path} {...STROKE} />
      ))}
    </svg>
  );
}
