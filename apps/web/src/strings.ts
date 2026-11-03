export const PRODUCT_NAME = 'Astra';

export const APP_ERROR_LABELS = {
  message: 'Something went wrong on this page.',
  reload: 'Reload',
};

export const API_ERROR_LABELS = {
  validation: 'Check the details and try again.',
  rejected: 'That could not be completed.',
  server: 'Something went wrong on our side. Try again.',
  network: 'Could not connect. Check your connection and try again.',
  aborted: 'That took too long. Try again.',
};

export const MENU_LABELS = {
  home: 'Home',
  sessions: 'Sessions',
};

export const SIDEBAR_LABELS = {
  menu: 'Menu',
  recent: 'Recent',
  noSessions: 'Your sessions will appear here.',
};

export const THEME_LABELS = {
  appearance: 'Appearance',
  light: 'Light',
  dark: 'Dark',
};

export const PLACEHOLDER_ACCOUNT = {
  name: 'Student',
  status: 'Not signed in',
};

export const HOME_LABELS = {
  greeting: (studentName: string) => `Welcome back, ${studentName}.`,
  greetingWithoutName: 'Welcome back.',
  question: 'What do you want to learn next?',
  continueLabel: 'Continue',
  continueButton: 'Continue session \u2192',
  picksLabel: 'Picked for you',
  pickDetails: (subject: string, lengthMinutes: number) => `${subject}, ${lengthMinutes} min`,
  loading: 'Loading your home screen.',
  tryAgain: 'Try again',
  sessionsOpenSoon: 'Sessions open soon.',
  sessionsOpenSoonQuestionKept: 'Sessions open soon. Your question is still here.',
};

export const CHAT_BOX_LABELS = {
  label: 'What do you want to learn next',
  placeholder: 'Ask anything. A topic, a question, a problem.',
  placeholderWhileTalkIsOn: 'Talking opens soon. Type for now.',
  attach: 'Photo or PDF',
  talk: 'Talk',
  send: 'Start session',
  removeAttachment: 'Remove',
  removeAttachmentMark: '\u00D7',
};

export const DRAWING_LABELS = {
  arc: 'A ball leaving a hand and travelling in an arc to a hoop',
  forces: 'A block on a slope with arrows showing the normal force, friction and weight',
  forceWeight: 'W',
  forceNormal: 'N',
  forceFriction: 'F',
  growth: 'A curve that rises slowly and then steeply',
  helix: 'Two strands of DNA twisted around each other',
};
