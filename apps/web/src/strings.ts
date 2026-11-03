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
  network: 'Could not connect. Try again in a moment.',
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

export const ACCOUNT_LABELS = {
  unnamedStudent: 'Student',
  signOut: 'Sign out',
  closed: "We can't set up this account.",
  tryAgain: 'Try again',
  stillLoading: 'Still opening your account. This can take a moment.',
};

export const SIGN_IN_LABELS = {
  tagline: 'A learning app, made for you',
  about: "Your tutor talks with you and draws as it explains. It's an AI, and setup takes under two minutes.",
  google: 'Continue with Google',
  email: 'Continue with email',
  terms: 'By continuing you agree to the Terms and the Privacy Policy.',
  linkFailed: 'That link did not work. It may have expired, or it was opened in another browser. Ask for a new one here.',
  cancelled: 'Sign-in did not finish. You can start again here.',
  authUnreachable: 'We could not connect to finish signing you in. Ask for a new link here in a moment.',
  emailQuestion: 'What is your email address?',
  emailPlaceholder: 'Your email address',
  sendLink: 'Send link',
  sentQuestion: 'Check your email.',
  sentAbout: 'We sent a link to this address. Open it in this browser to sign in.',
  useAnotherEmail: 'Use a different email',
  invalidEmail: 'Enter a valid email address.',
  tooManyRequests: "We can't send another link right now. If you asked for one already, check your email. Otherwise, try again in a few minutes.",
  authFailed: 'Could not send the link. The fault is on our side, so try again soon.',
  failed: 'Could not send the link. Try again in a moment.',
};

export const BIRTH_DATE_LABELS = {
  question: 'When were you born?',
  about: 'We use this to keep the product safe for your age.',
  day: 'Day',
  dayPlaceholder: 'DD',
  month: 'Month',
  monthPlaceholder: 'MM',
  year: 'Year',
  yearPlaceholder: 'YYYY',
  next: 'Continue →',
  rejected: 'Check the date and try again.',
  confirmQuestion: 'Is this right?',
  confirm: 'Yes, continue',
  change: 'Change it',
};

export const TUTOR_NOTES_LABELS = {
  title: "Your tutor's notes",
  madeFor: 'Made for',
  you: 'you',
  into: 'Into',
  level: 'Level',
  goal: 'Here for',
  voice: 'Voice',
  footer: 'You can change any of this later.',
};

export const DEV_SIGN_IN_LABELS = {
  title: 'Development sign-in',
  failed: 'Sign-in failed. Run pnpm db:up to create these accounts.',
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
    network: 'Your home screen did not load. Try again in a moment.',
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
