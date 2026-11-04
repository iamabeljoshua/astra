import { CODE_LENGTH } from './auth/codeLength';
import { isLessonEnabled } from './session/lessonFlag';

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

export const CHART_LABELS = {
  subjectStars: ['Motion', 'Light', 'Waves', 'Music', 'Cells', 'Code', 'Stars', 'History'],
  titleFor: (name: string) => `A learning app, made for ${name}`,
};

export const SIGN_IN_LABELS = {
  tagline: CHART_LABELS.titleFor('you'),
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
  questionFor: (name: string) => `Welcome, ${name}.\nWhen were you born?`,
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
  saving: 'Saving your date of birth.',
};

export const TUTOR_NOTES_LABELS = {
  into: 'Into',
  level: 'Level',
  goal: 'Here for',
};

export const ONBOARDING_LABELS = {
  back: '\u2190 Back',
  next: 'Continue \u2192',
  progress: (stepNumber: number, stepCount: number) => `${stepNumber} of ${stepCount}`,
  nameQuestion: "You're in.\nWhat should I call you?",
  nameLabel: 'Your first name',
  nameMissing: 'Tell me what to call you.',
  intoQuestion: 'What are you into?',
  intoAbout: 'Pick as many as you like. We use them to suggest topics for you.',
  levelQuestion: 'Where are you in your learning?',
  goalQuestion: 'What brings you here?',
  changeLater: 'You can change any of this later.',
  saving: 'Saving your answers.',
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
  about: 'We use these to greet you and suggest topics. Change anything here.',
  name: 'Name',
  save: 'Save changes',
  saving: 'Saving.',
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
  continueReason: (subject: string) => `${subject}. Carry on where you left off.`,
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
  placeholderWhileTalkIsOn: 'Your tutor is listening. You can type too.',
  send: 'Send reply',
};

export const VOICE_LABELS = {
  you: 'You',
  board: 'Board',
  connecting: 'Connecting your tutor',
  unavailable: 'Your tutor could not connect just now.',
  reconnecting: 'Your connection dropped. Reconnecting.',
  ended: 'Your connection to the tutor ended.',
  sessionLimit: 'This session has reached its limit. Start a new session to carry on.',
  dailyLimit: 'That is all your tutor time for now. It resets once a day, so please try again later. Your sessions are kept.',
  broken: 'Your tutor has stopped working in this session. Start a new one to carry on.',
  sessionFinished: 'This session has finished.',
  tutorLost: 'Your tutor stopped responding. Your microphone is off. Try again and a tutor will start fresh, without what was said so far.',
  startedFresh: 'Your tutor had to start fresh, without what was said so far.',
  micDenied: 'Your browser did not allow the microphone. You can type instead.',
  micNoDevice: 'We could not find a microphone on this device. You can type instead.',
  micFailed: 'Your microphone could not start. You can type instead.',
  micOn: 'Your microphone is on.',
  quietWarning: 'It has been quiet for a while, so this room closes in about a minute. Your session stays here either way.',
  stillHere: 'Keep the room open',
  closedForQuiet: 'This room closed because it stayed quiet. Your session is still here. Open it again and a tutor will start fresh, without what was said so far.',
  openAgain: 'Open the room again',
  tryAgain: 'Try again',
  tapToHear: 'Tap to hear your tutor',
  answerPrompt: 'Press Talk to answer, or type.',
  tooSoon(waitSeconds: number | null) {
    const minutes = Math.max(1, Math.ceil((waitSeconds ?? 60) / 60));
    return `Your tutor has been started many times, so a new one can start in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}. Your session is still here.`;
  },
};

export const BOARD_WORK_LABELS = {
  movePoint: 'Move the point along the curve',
  entry: 'Write on the board',
  pen: 'Pen',
  done: 'Done',
  band: 'Write here with your finger, a pen, or the mouse',
  reading: 'Reading your writing',
  notWhatYouWrote: 'Not what you wrote? Type it.',
  talk: 'Talk',
  type: 'Type',
  visualLookAgain: 'Look at the picture again',
  visualPutBack: 'Put the picture back in the corner. Your work is still there.',
  mathKeys: 'Math keys',
  hint: 'Type, write, or talk, words or math. Esc stops the tutor.',
  tutorState: { ready: 'Ready', talking: 'Talking', reading: 'Reading your work', waiting: 'Waiting for you', watching: 'Watching', stopped: 'Stopped' },
  placeholder: 'Type or say it. Words or math.',
  readAs: 'Read as',
  kinds: { math: 'math', words: 'words', mixed: 'words and math', code: 'code' },
  youTyped: 'You typed',
  youSaid: 'You said',
  notWhatYouSaid: 'Not what you said? Type it.',
  checked: 'Code checked this. It holds.',
  items: 'To place',
  emptySlot: 'Empty',
  clearSlot: (item: string, slot: string) => `Take ${item} out of ${slot}`,
  placeInSlot: (slot: string) => `Place in ${slot}`,
  pickPart: (part: string) => `Pick ${part}`,
};

export const VOICE_TEST_LABELS = {
  title: 'Microphone test',
  intro: 'For a real microphone in a real room. Read each line in your own voice, then wait for the tutor before the next one.',
  openWithCleanup: 'Start with speech cleanup on',
  openWithoutCleanup: 'Start with speech cleanup off',
  start: 'Talk',
  first: 'First line',
  next: 'Next line',
  micOn: 'Your microphone is on.',
  micOff: 'Your microphone is off.',
  done: 'That is every line. Close this tab, then run the second pass.',
  lineOf: (line: number, total: number) => `Line ${line} of ${total}`,
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
  replyNotSent: 'This did not reach your tutor.',
  replyWaiting: 'Your tutor will read this as soon as it connects.',
  finishedWords: 'This session has finished.',
  boardStandIn: 'Your tutor will draw here as it speaks.',
  askAboutTopic: (title: string) => `I'd like to learn about ${title}.`,
  carryOnWith: (title: string) => `I'm back to carry on with this: ${title}`,
  you: 'You',
  loading: 'Opening your session.',
  notFound: 'This session could not be found.',
  tryAgain: 'Try again',
};

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

function getPlainWait(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE));
  if (minutes < MINUTES_PER_HOUR) return `about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / MINUTES_PER_HOUR);
  return `about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

export const SCENE_LABELS = {
  notCheckedByPerson: 'Drawn for this lesson. Not yet checked by a person.',
  wordsNotChecked: 'Written for this lesson. Not yet checked by a person.',
  answerStandIn: "I heard you. I can't answer questions yet, so I'll carry on.",
  lessonDown: "The lesson can't start right now. Your session is saved, so you can try again.",
  tooManyLessons: "You've opened a lot of lessons. Try again in a little while.",
  twoLessonsOpen: 'You have two lessons open. Close one, then try again.',
  tooManyStarts: (seconds: number) => `You've opened a lot of lessons. Try again in ${getPlainWait(seconds)}.`,
  studentSpent: (seconds: number) => `That's all your lesson time for today. More opens in ${getPlainWait(seconds)}.`,
  everyoneSpent: (seconds: number) => `Lessons have reached today's limit for everyone, so this isn't anything you did. They open again in ${getPlainWait(seconds)}.`,
  voiceAtLimit: "The tutor's voice has reached today's limit, so you'll hear a tone. The words stay on screen.",
  backToHome: 'Back to Home',
  lessonMoved: 'This lesson moved to another tab.',
  lessonLost: 'The connection to your lesson dropped. Your session is saved.',
  lessonEnded: 'This lesson has ended.',
  lessonSilent: "The tutor hasn't started talking. Try opening the lesson again.",
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

export const LAB_LABELS = {
  title: 'Scene player lab',
  intro: 'A development bench for the board clock. It plays test text only.',
  noRoom: 'Start the lab with pnpm lab, then open the address it prints.',
  board: 'Board',
  controls: 'Controls',
  connect: 'Connect',
  play: 'Play the lesson',
  interrupt: 'Interrupt',
  resume: 'Resume',
  replay: 'Replay from the log',
  backToLive: 'Back to live',
  logEvents: 'Events in the log:',
};

export const BOARD_LABELS = {
  figures: {
    slope: 'slope',
    metres: 'm',
    degrees: '\u00b0',
    readouts: {
      time: { label: 'Time', unit: 's' },
      height: { label: 'Height', unit: 'm' },
      distance: { label: 'Distance', unit: 'm' },
      speed: { label: 'Speed', unit: 'm/s' },
      'velocity-x': { label: 'Sideways speed', unit: 'm/s' },
      'velocity-y': { label: 'Upward speed', unit: 'm/s' },
      'peak-height': { label: 'Highest point', unit: 'm' },
      'landing-distance': { label: 'Lands at', unit: 'm' },
    },
    parameters: {
      horizontalSpeed: { label: 'Sideways speed', unit: 'm/s' },
      upwardSpeed: { label: 'Upward speed', unit: 'm/s' },
      releaseHeight: { label: 'Release height', unit: 'm' },
      gravity: { label: 'Gravity', unit: 'm/s\u00b2' },
      launchAngle: { label: 'Launch angle', unit: '\u00b0' },
      launchSpeed: { label: 'Launch speed', unit: 'm/s' },
    },
    tooFine: 'Too fine to draw here',
  },
  numberLine: 'Number line',
  geometry: 'Geometry figure',
  simulation: 'Moving ball, with its path',
  graphOf: 'Graph of y =',
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

// With lessons off, the legal pages stay exactly as they are without them.
const inTestLessons = (...lines: string[]) => (isLessonEnabled() ? lines : []);

export const LEGAL_PAGES: Record<'terms' | 'privacy', LegalDocument> = {
  terms: {
    title: 'Terms',
    intro: `These terms apply when you use ${PRODUCT_NAME}. A line marked planned describes something the app does not offer yet.`,
    sections: [
      {
        heading: `What ${PRODUCT_NAME} is`,
        today: [
          `${PRODUCT_NAME} is a learning app built around an AI tutor. You can sign in, answer a few questions about yourself, open a home screen with suggested lessons, and start sessions that are saved to your account. In a lesson the tutor talks and draws on a board, and you reply by talking or typing. The tutor is an AI and it can be wrong, so check anything that matters.`,
          ...inTestLessons('Spoken lessons with drawings are in testing and are not open to students yet.'),
        ],
        planned: [
          'Lessons that follow a plan across several ideas, with more kinds of drawing.',
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
          "Each session's title, subject, language, picture, length, status, and start time, and the suggested lesson it came from, if any. A question you send from the home screen becomes its session's title, cut to 200 characters, so we store those words.",
          ...inTestLessons('The drawings and words a tutor writes for a test lesson are saved on our server, with the code and pictures behind them. Those made for a suggested lesson come only from its title and can be shown to other students. Those made for a question you typed are saved with your account ID, and only you can see them, because they are written from a short topic a model takes from your words.'),
          ...inTestLessons("A recording of what the tutor says in a test lesson is saved on our server too, as audio with the words and their timing. For a suggested lesson it can be played to other students. For a question you typed it is saved in a folder named with your account ID, it is played only in your own lessons, and we remove it with your other saved lesson data. Your own voice is never recorded, because test lessons do not use your microphone."),
          ...inTestLessons('A record of what each test lesson cost, saved on our server with your account ID: which AI model was used, what it cost, how many characters of voice were made, and when. It holds none of your words.'),
          'We also use the sessions you start from suggested lessons, and their length, status, and start time, to choose what your home screen suggests next. A question you leave open can take the continue card, so a lesson you left open can then appear among the suggestions. Only your own sessions do this, and the words of the questions you type play no part in it.',
          'Any file you attach stays in your browser. It is not sent or stored.',
          'Your microphone stays off until you press Talk in a session, and your browser asks first. While it is on, your voice goes live to the services named under Who receives your data. We do not store your voice or any recording of it.',
          "The words you say or type in a session go to our tutor service, which holds them in memory while the session runs and drops them when it ends. It passes them to Anthropic, as Who receives your data says. We do not store them yet.",
          "So do the lines you type on the board, what you pick, place, or drag there, and what our code made of each one. We do not store them yet either.",
          "A line you have typed on the board and not sent stays in your browser until you pause for a few seconds. Then it can go to our tutor service and to Anthropic, so the tutor can tell whether you need help. We do not store it.",
          "If you write with the pen, your strokes go to our tutor service, which holds them in memory while the session runs. It makes a picture of what you wrote and sends that picture to Anthropic to read it. We do not store the strokes or the picture yet.",
          'Words you type into the search box on the Sessions page go to our server, which uses them to find your sessions. We do not store them.',
          'A running total of what the tutor cost for you each day, with no words in it. We use it to stop tutor time for the day at a limit.',
        ],
        planned: [
          "Each lesson's transcript and board drawings, with what you typed, wrote, picked, placed, or dragged on the board, kept while the account is active. Your voice itself stays unstored.",
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
          isLessonEnabled()
            ? 'Supabase runs our sign-in service and our database, so it holds your account, your notes, and your sessions, and it sends the sign-in email. What a test lesson saves, its drawings, recordings, and cost records, stays on our own server and does not go to Supabase.'
            : 'Supabase runs our sign-in service and our database, so it holds everything we store on our servers, and it sends the sign-in email.',
          'When a session opens, your browser joins LiveKit Cloud, even before you press Talk, so LiveKit receives your IP address and your student ID, a random code that does not include your name. During the session, LiveKit Cloud carries your voice, the tutor\'s voice, and the messages between your browser and the tutor, including your words as text. We do not ask it to record any of this. We do not send LiveKit your name, your date of birth, your email address, your level, your interests, or your goal, though it carries anything you say or type yourself.',
          "While your microphone is on, Meta's Muse Voice Transcribe receives your voice and turns it into text. Meta's terms let it keep what it receives for safety checks and human review.",
          "Anthropic, whose Claude model writes the tutor's replies, receives what you say and type in a session, including lines on the board, a line you paused on without sending, and a picture of anything you write with the pen, the tutor's earlier words, and your level, interests, and goal. We do not send it your name, your date of birth, your email address, or an account ID, though it receives anything you say or type yourself. Anthropic's terms say it does not train on this by default, and that it keeps it for a limited time.",
          "ElevenLabs receives the tutor's words and turns them into its voice. Those words can repeat what you said or typed.",
          ...inTestLessons("While spoken lessons are in testing, a test lesson sends Anthropic's Claude models the title of the suggested lesson, or the whole question you typed, whatever it says, which they use to choose and write a drawing and the tutor's words. A model then writes the drawing from a short topic it takes from your question, and it can get that wrong, so a personal detail in your question can reach those models and the words a tutor says to you. ElevenLabs receives the tutor's words and turns them into its voice, and the audio travels through a LiveKit server. Please leave your name, school, and other personal details out of your questions."),
          'No other outside service receives student data today. The app serves its own fonts and pictures.',
        ],
        planned: [
          'A zero-retention agreement with Anthropic, which we will ask for before any student under 18 joins.',
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
          'The app shows no ads. We do not sell student data. We do not store raw audio.',
          'Meta, Anthropic, and ElevenLabs run the AI models named above. We use the Muse model Meta lists as a Standard Model, and its terms say it does not train on content from those. Anthropic does not train on what it receives by default. ElevenLabs offers a setting that keeps its models from training on what it receives, and we have not yet confirmed that setting. A lawyer has not reviewed any of these.',
          'The app uses no camera, no voiceprints, and no emotion inference.',
          ...inTestLessons('Anthropic runs the Claude models that test lessons use, and a lawyer has not reviewed that either.'),
        ],
        planned: [
          'Before real students use the app, confirming that no model trains on under-18 data, and adults opting in to any training use.',
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
