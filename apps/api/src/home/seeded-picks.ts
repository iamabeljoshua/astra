import type { PickCardResponseDto } from './home-screen.dto';

export const SEEDED_PICKS: PickCardResponseDto[] = [
  {
    id: 'jump-shot',
    title: 'How a jump shot flies',
    subject: 'Physics',
    lengthMinutes: 12,
    reason: 'Because you play basketball',
    artwork: 'arc',
  },
  {
    id: 'breaking-wave',
    title: 'Why a breaking wave curls',
    subject: 'Physics',
    lengthMinutes: 12,
    reason: 'Because you follow surfing',
    artwork: 'wave',
  },
  {
    id: 'savings-growth',
    title: 'Why savings grow slowly, then fast',
    subject: 'Math',
    lengthMinutes: 15,
    reason: 'You got stuck on exponents on Tuesday',
    artwork: 'growth',
  },
  {
    id: 'saturn-rings',
    title: 'Why Saturn has rings',
    subject: 'Astronomy',
    lengthMinutes: 10,
    reason: 'Because you like space',
    artwork: 'saturn',
  },
  {
    id: 'dna-copying',
    title: 'How DNA copies itself',
    subject: 'Biology',
    lengthMinutes: 15,
    reason: 'Next in your biology class',
    artwork: 'helix',
  },
  {
    id: 'plato-aristotle',
    title: 'What Plato and Aristotle disagreed about',
    subject: 'Philosophy',
    lengthMinutes: 20,
    reason: 'Because you asked about ethics',
    artwork: 'athens',
  },
];
