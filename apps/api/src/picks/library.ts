import type { ArtworkName } from '../artwork';
import type { StudentGoal, StudentInterest, StudentLevel } from '../students/student-profile-options';
import libraryData from './library.json';

export interface LibraryTopic {
  id: string;
  title: string;
  subject: string;
  lengthMinutes: number;
  openingLine: string;
  artwork: ArtworkName;
  levels: StudentLevel[];
  goals: StudentGoal[];
  interests: StudentInterest[];
}

export interface Library {
  topics: LibraryTopic[];
}

// library.spec.ts checks every level, goal, interest, and artwork name, which a JSON import cannot type.
export const LIBRARY = libraryData as Library;
