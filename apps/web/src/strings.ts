export const PRODUCT_NAME = 'Astra';

export const APP_ERROR_LABELS = {
  heading: 'This page stopped working.',
  message: 'The fault is on our side. Reloading opens the page again and clears anything you typed.',
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
  loadFailure: {
    validation: 'Your home screen did not load.',
    rejected: 'Your home screen did not load.',
    server: 'Your home screen did not load. The fault is on our side.',
    network: 'Your home screen did not load. Check your connection.',
    aborted: 'Your home screen is taking too long to load.',
  },
  cardsCrashHeading: 'Your cards could not be shown.',
  cardsCrashMessage: 'The fault is on our side. Anything you typed is still in the box below.',
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
  removeAttachment: (fileName: string) => `Remove ${fileName}`,
  removeAttachmentMark: '\u00D7',
};

export const ARTWORK_LABELS = {
  arc: 'A ball leaving a hand and travelling in an arc to a hoop',
  athens: 'Raphael\'s School of Athens, with philosophers gathered in a great hall',
  forces: 'A block on a slope with arrows showing the normal force, friction and weight',
  forceWeight: 'W',
  forceNormal: 'N',
  forceFriction: 'F',
  growth: 'A curve that rises slowly and then steeply',
  helix: 'Two strands of DNA twisted around each other',
  saturn: 'Saturn and its rings, lit from behind by the Sun',
  wave: 'A great wave curling over small boats, with a mountain in the distance',
};
