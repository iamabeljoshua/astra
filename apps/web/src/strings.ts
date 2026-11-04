import { CODE_LENGTH } from './auth/codeLength';

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
  authUnreachable: 'Could not connect. Try again in a moment.',
  tokenRefusedAfterRenewal: 'Something went wrong on our side. Try again.',
  aborted: 'That took too long. Try again.',
  timeout: 'That took too long. Try again.',
};

export const MENU_LABELS = {
  home: 'Home',
  sessions: 'Sessions',
};

export const SIDEBAR_LABELS = {
  menu: 'Menu',
  recent: 'Recent',
  noSessions: 'Your sessions will appear here.',
  recentFailure: 'Your recent sessions did not load.',
};

export const THEME_LABELS = {
  appearance: 'Appearance',
  light: 'Light',
  dark: 'Dark',
};

export const ACCOUNT_LABELS = {
  unnamedStudent: 'Student',
  profile: 'Your notes',
  signOut: 'Sign out',
  closed: "We can't set up this account.",
  tryAgain: 'Try again',
  stillLoading: 'Still opening your account. This can take a moment.',
};

export const SIGN_IN_LABELS = {
  tagline: 'A learning app, made for you',
  welcomeLine: 'Welcome, I am Astra, your personal AI tutor.',
  emailLabel: 'Your email',
  emailPlaceholder: 'you@example.com',
  sendCode: 'Continue',
  google: 'Continue with Google',
  agreementStart: 'By continuing you agree to the ',
  agreementJoin: ' and the ',
  agreementEnd: '.',
  returnFailed: 'That sign-in did not work. You can start again here.',
  cancelled: 'Sign-in did not finish. You can start again here.',
  authUnreachable: 'We could not connect to finish signing you in. Try again here in a moment.',
  signUpStopped: ACCOUNT_LABELS.closed,
  invalidEmail: 'Enter a valid email address.',
  tooManyRequests: "We can't send another code right now. If you asked for one already, check your email. Otherwise, try again in a few minutes.",
  authFailed: 'Could not send the code. The fault is on our side, so try again soon.',
  failed: 'Could not send the code. Try again in a moment.',
  codeLine: 'Check your email. I sent you a code.',
  codeLabel: `${CODE_LENGTH}-digit code`,
  sentTo: (email: string) => `Sent to ${email}`,
  useAnotherEmail: 'Use a different email',
  resend: 'Send a new code',
  resendIn: (seconds: number) => `Send a new code in ${seconds}s`,
  newCodeSent: 'I sent a new code. Only the newest one works.',
  checking: 'Checking your code.',
  codeWrong: "That code didn't work. Check it against your newest email and try again.",
  codeExpired: 'That code has expired. Ask for a new one below.',
  tooManyTries: 'Too many tries from this connection. Wait a few minutes, then try again.',
  checkAuthFailed: 'Could not check the code. The fault is on our side, so try again soon.',
  checkFailed: 'Could not check the code. Try again in a moment.',
};

export const BIRTH_DATE_LABELS = {
  question: 'When were you born?',
  about: 'We ask everyone this before an account opens.',
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
  footer: 'You can change any of this later.',
};

export const ONBOARDING_LABELS = {
  back: '\u2190 Back',
  next: 'Continue \u2192',
  progress: (stepNumber: number, stepCount: number) => `${stepNumber} of ${stepCount}`,
  nameQuestion: 'What should your tutor call you?',
  namePlaceholder: 'Your first name',
  nameMissing: 'Tell your tutor what to call you.',
  intoQuestion: 'What are you into?',
  intoAbout: 'Pick as many as you like. Your tutor uses them to choose examples you care about.',
  levelQuestion: 'Where are you in your learning?',
  goalQuestion: 'What brings you here?',
};

export const STUDENT_LEVEL_LABELS = {
  middle_school: 'Middle school',
  high_school: 'High school',
  university: 'University',
  out_of_school: 'Out of school',
};

export const STUDENT_GOAL_LABELS = {
  class: 'Improve my grades',
  exam: 'Get ready for an exam',
  curiosity: "Learn anything I'm curious about",
};

export const STUDENT_INTEREST_LABELS = {
  basketball: 'Basketball',
  football: 'Football',
  movies: 'Movies',
  gaming: 'Gaming',
  music: 'Music',
  art: 'Art',
  space: 'Space',
  cars: 'Cars',
  cooking: 'Cooking',
  fashion: 'Fashion',
  coding: 'Coding',
  history: 'History',
};

export const PROFILE_LABELS = {
  title: "Your tutor's notes",
  about: 'Your tutor teaches from these. Change anything here.',
  name: 'Name',
  save: 'Save changes',
  saved: 'Saved.',
  missing: 'Your name cannot be blank.',
};

export const DEV_SIGN_IN_LABELS = {
  title: 'Development sign-in',
  failed: 'Sign-in failed. Run pnpm db:up to create these accounts.',
};

export const HOME_LABELS = {
  greeting: (studentName: string) => `Welcome back, ${studentName}.`,
  newStudentGreeting: (studentName: string) => `Welcome, ${studentName}.`,
  greetingWithoutName: 'Welcome.',
  question: 'What do you want to learn next?',
  continueLabel: 'Continue',
  continueButton: 'Continue session \u2192',
  picksLabel: 'Picked for you',
  pickDetails: (subject: string, lengthMinutes: number) => `${subject}, ${lengthMinutes} min`,
  loading: 'Loading your home screen.',
  stillLoading: 'Still loading your home screen.',
  loadFailure: {
    validation: 'Your home screen did not load.',
    rejected: 'Your home screen did not load.',
    server: 'Your home screen did not load. The fault is on our side.',
    network: 'Your home screen did not load. Try again in a moment.',
    authUnreachable: 'Your home screen did not load. Try again in a moment.',
    tokenRefusedAfterRenewal: 'Your home screen did not load. The fault is on our side.',
    aborted: 'Your home screen is taking too long to load.',
    timeout: 'Your home screen is taking too long to load.',
  },
  cardsCrashHeading: 'Your cards could not be shown.',
  cardsCrashMessage: 'The fault is on our side. Anything you typed is still in the box below.',
  tryAgain: 'Try again',
  stillStarting: 'Still starting your session. This can take a moment.',
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

export const REPLY_BOX_LABELS = {
  label: 'Your reply',
  placeholder: 'Talk, or type a reply',
  placeholderWhileTalkIsOn: CHAT_BOX_LABELS.placeholderWhileTalkIsOn,
  send: 'Send reply',
};

export const SESSIONS_LABELS = {
  search: 'Search your sessions',
  newSession: 'New session \u2192',
  columns: {
    session: 'Session',
    subject: 'Subject',
    date: 'Date',
    length: 'Length',
    status: 'Status',
    open: 'Open',
  },
  statuses: {
    in_progress: 'In progress',
    finished: 'Finished',
  },
  resume: 'Continue \u2192',
  open: 'Open \u2192',
  today: 'Today',
  rowDetails: (subject: string, date: string, length: string) => `${subject}, ${date}, ${length}`,
  noMatch: 'No sessions match that search.',
  showMore: 'Show more',
  loading: 'Loading your sessions.',
  tryAgain: 'Try again',
};

export const SESSION_LABELS = {
  questionSubject: 'Your question',
  endSession: 'End session',
  ending: 'Ending\u2026',
  close: 'Close',
  yourTutor: 'Your tutor',
  standInWords: 'Live lessons open soon. Your session is saved, so you can come back to it here.',
  standInAnswer: "I can't answer yet. Live lessons open soon.",
  finishedWords: 'This session has finished.',
  boardStandIn: 'Your tutor will draw here as it speaks.',
  you: 'You',
  loading: 'Opening your session.',
  notFound: 'This session could not be found.',
  tryAgain: 'Try again',
};

export const ARTWORK_LABELS = {
  alchemist: 'Pieter Bruegel\'s engraving of an alchemist at work in a cluttered room',
  arc: 'A ball leaving a hand and travelling in an arc to a hoop',
  athens: 'Raphael\'s School of Athens, with philosophers gathered in a great hall',
  balance: 'A balance with two level pans',
  bars: 'Five bars in order from shortest to tallest',
  bastille: 'An engraving of the crowd storming the Bastille in 1789',
  binary: 'The digits 1 and 0 in two rows',
  blackhole: 'An artist\'s view of a black hole with a disk of gas and a bright jet',
  braking: 'A car on a road above two stopping distances, one four times the other',
  branches: 'A line that splits in two, and splits in two again',
  cake: 'Raphaelle Peale\'s still life of a cut cake, fruit, and a glass of wine',
  circuit: 'A battery in a loop of wire with a resistor',
  clock: 'Light bouncing in a zigzag between two mirrors',
  curve: 'A ball curving over a wall of players toward a goal',
  draughtsman: 'Albrecht D\u00fcrer\'s woodcut of two men tracing a lute through a frame',
  earth: 'The whole Earth seen from Apollo 17',
  earthrise: 'Earth rising over the Moon, seen from Apollo 8',
  forces: 'A block on a slope with arrows showing the normal force, friction and weight',
  forceWeight: 'W',
  forceNormal: 'N',
  forceFriction: 'F',
  frames: 'Three film frames showing a ball rising',
  grid: 'A grid of squares with two crossed out',
  growth: 'A curve that rises slowly and then steeply',
  ham: 'Philippe Rousseau\'s still life of a roast ham on a laid table',
  helix: 'Two strands of DNA twisted around each other',
  indigo: 'A cloth printed in indigo blue with ships and figures',
  launch: 'A Saturn V rocket rising above its launch pad',
  lock: 'A closed padlock',
  loom: 'A portrait of Joseph Marie Jacquard, woven in silk',
  lute: 'Johannes Vermeer\'s painting of a young woman tuning a lute by a window',
  melencolia: 'Albrecht D\u00fcrer\'s engraving Melencolia I, with a magic square on the wall',
  nebula: 'The Eagle Nebula glowing in infrared light',
  parabola: 'A curve rising and falling, crossing a line at two points',
  piston: 'A piston in a cylinder, joined to a turning crank',
  pitch: 'A goal seen from above, with three shots aimed at it',
  prism: 'A ray of light entering a prism and spreading into three rays',
  pyramid: 'A photograph of the Great Pyramid from 1858',
  route: 'A map of connected points',
  saturn: 'Saturn and its rings, lit from behind by the Sun',
  socrates: 'Jacques Louis David\'s painting of Socrates reaching for the cup among his friends',
  string: 'A string vibrating between two fixed ends',
  sunflowers: 'Vincent van Gogh\'s painting of two cut sunflowers',
  table: 'The outline of the periodic table',
  tangent: 'A curve with a straight line touching it at one point',
  terrain: 'A line of jagged mountains',
  triangle: 'A right triangle with a square on each side',
  wave: 'A great wave curling over small boats, with a mountain in the distance',
  waveform: 'Vertical lines of different heights, like a sound wave',
  wheat: 'Vincent van Gogh\'s painting of a wheat field and cypress trees under a swirling sky',
};

export const LEGAL_LABELS = {
  draftNotice: 'Draft of 4 November 2026. A lawyer has not yet reviewed this page.',
  planned: 'Planned',
  back: `Back to ${PRODUCT_NAME}`,
  pageTitle: (documentTitle: string) => `${documentTitle} | ${PRODUCT_NAME}`,
};

interface LegalSection {
  heading: string;
  today: string[];
  planned: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_PAGES: Record<'terms' | 'privacy', LegalDocument> = {
  terms: {
    title: 'Terms',
    intro: `These terms apply when you use ${PRODUCT_NAME}. A line marked planned describes something the app does not offer yet.`,
    sections: [
      {
        heading: `What ${PRODUCT_NAME} is`,
        today: [
          `${PRODUCT_NAME} is a learning app being built around an AI tutor. Today you can sign in, answer a few questions about yourself, open a home screen with suggested lessons, and start sessions that are saved to your account. Live lessons do not open yet.`,
        ],
        planned: [
          'Spoken lessons, where the tutor talks with you and draws on a board as it explains. The tutor is an AI and it can be wrong, so check anything that matters.',
        ],
      },
      {
        heading: `Who ${PRODUCT_NAME} is for`,
        today: [
          `${PRODUCT_NAME} is for students aged 13 and up. After you first sign in, we ask for your date of birth. Give your real date. The first date you confirm stands, and the app has no way to change it.`,
          'If that date shows you are under 13 in every time zone, the account closes and stays closed on every later sign-in. The Privacy Policy says what we keep.',
          'If you are under 18, these terms apply to you as they do to any other student. We do not ask a parent or guardian to approve your account.',
        ],
        planned: [],
      },
      {
        heading: 'Your account',
        today: [
          'You sign in with a code sent to your email address, and you do not set a password. Use an address that belongs to you.',
          "Do not try to reach another student's account or data, get around the date of birth question, or interfere with the service.",
        ],
        planned: ['Sign-in with Google.'],
      },
      {
        heading: 'Cost and changes',
        today: [
          `${PRODUCT_NAME} is free. Nothing in the app asks for or takes payment.`,
          `${PRODUCT_NAME} is an early product. Any part of it may change, stop working, or lose data, and we make no promise that it will always be available.`,
        ],
        planned: [],
      },
      {
        heading: 'Still to be written',
        today: [],
        planned: [
          `Before real students use ${PRODUCT_NAME}, a lawyer will review these terms and add the company's legal name, contact details, governing law, and limits of liability.`,
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: `This page says what ${PRODUCT_NAME} collects today, who receives it, and what is planned. A line marked planned describes something the app does not offer yet, and the app sends no data for it.`,
    sections: [
      {
        heading: 'What we store',
        today: [
          "Your email address, the times you sign in, and a record of each sign-in. Supabase Auth, our sign-in service, keeps these. Its records include your IP address and your browser's description of itself.",
          'Your date of birth, if you are old enough to continue. We keep it in our database with an account ID and the time the record was made.',
          'The name you give your tutor, your level, the interests you choose, and your goal. We keep these in our database, and you can change them under Your notes. We use your level, interests, and goal to choose the lessons suggested on your home screen.',
          "Each session's title, subject, language, picture, length, status, and start time. A question you send from the home screen becomes its session's title, cut to 200 characters, so we store those words.",
          "Any file you attach, and anything you type into a session's reply box, stay in your browser. They are not sent or stored. The app does not use your microphone.",
          'Words you type into the search box on the Sessions page go to our server, which uses them to find your sessions. We do not store them.',
        ],
        planned: [
          "Each lesson's transcript and board drawings, kept while the account is active.",
        ],
      },
      {
        heading: 'In your browser',
        today: [
          'Your browser keeps your sign-in and your light or dark choice in local storage. Its session storage holds the email address you last asked a sign-in code for and the time you asked.',
          'When an account closes, or a closed account signs in again, the app sets one cookie that stops new sign-ups on this browser for a day. It holds no name, address, or date, it expires by itself, and nothing on our servers reads it. Accounts already set up can still sign in. The app sets no other cookies and runs no analytics or advertising code.',
        ],
        planned: [],
      },
      {
        heading: 'If you are under 13',
        today: [
          'If the date you confirm shows you are under 13 in every time zone, the account closes and we do not store that date or the name you gave.',
          'We keep a record holding only the account ID and the time, so the account stays closed on every later sign-in.',
          "Your email address is not deleted. It stays in Supabase Auth, in its user and identity records and in its logs, and nothing in the app removes it. We keep it for now because deleting it would let the same address sign up and answer again. The times you signed in, your IP address, and your browser's description of itself stay in Supabase Auth too.",
        ],
        planned: [
          'Before any real student joins, deleting the address from Supabase Auth, including its logs, and refusing that address from then on by keeping only a keyed hash of it.',
        ],
      },
      {
        heading: 'If you are under 18',
        today: [
          'We store the same things about you as about any other student, as listed under What we store, and we use them the same way.',
          'We do not ask a parent or guardian to approve your account. We do not ask for their email address, and we do not contact them.',
        ],
        planned: [],
      },
      {
        heading: 'Who receives your data',
        today: [
          'Supabase runs our sign-in service and our database, so it holds everything we store on our servers, and it sends the sign-in email.',
          'No other outside service receives student data today. The app serves its own fonts and pictures.',
        ],
        planned: [
          'LiveKit Cloud, which will carry lesson audio between you and the tutor.',
          "Meta's Muse Voice Transcribe, which will receive your voice and turn it into text.",
          "Anthropic, whose Claude models will receive the lesson conversation and write the tutor's replies.",
          "ElevenLabs, which will receive the tutor's words and turn them into its voice.",
          'Google, if we turn on sign-in with Google, which will handle that sign-in and pass your account details to Supabase Auth.',
          'An email delivery service and a hosting provider, not yet chosen. We will name them here before real students join.',
        ],
      },
      {
        heading: 'How long we keep it',
        today: [
          'We have no retention schedule, and nothing deletes data on a timer. What we store stays until we remove it by hand, except that a change under Your notes replaces the answer it changes. The app has no delete button yet.',
        ],
        planned: ['A way for you to delete your data from the app.'],
      },
      {
        heading: 'What we do not do',
        today: [
          'The app shows no ads. We do not sell student data. No AI model receives student data today, so none is trained on it.',
        ],
        planned: [
          'When lessons open, raw audio is processed live and not stored, no model is trained on under-18 data, and adults opt in to any training use. The product will use no camera, no voiceprints, and no emotion inference.',
        ],
      },
      {
        heading: 'Still to be written',
        today: [],
        planned: [
          `Before real students use ${PRODUCT_NAME}, a lawyer will review this policy and add the company's legal name, a contact address for privacy questions, and the rights that apply where you live.`,
        ],
      },
    ],
  },
};
