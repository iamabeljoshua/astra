import type { ArtworkName } from '../artwork';
import type { StudentGoal, StudentInterest, StudentLevel } from '../students/student-profile-options';
import deeperScenes from './deeper-scenes.json';
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
  alsoCalled?: string[];
}

export interface Library {
  topics: LibraryTopic[];
  topicOrder: Record<string, string[]>;
}

// library.spec.ts checks every level, goal, interest, and artwork name, which a JSON import cannot type.
export const LIBRARY = libraryData as Library;

export const LIBRARY_TOPIC_IDS = LIBRARY.topics.map((topic) => topic.id);

const TOPIC_IDS_WITH_DEEPER_SCENES = new Set(deeperScenes.deeper.map(({ topicId }) => topicId));

export const hasDeeperScenes = ({ id }: LibraryTopic) => TOPIC_IDS_WITH_DEEPER_SCENES.has(id);

export const findLibraryTopic = (topicId: string | null | undefined): LibraryTopic | undefined => LIBRARY.topics.find((topic) => topic.id === topicId);
