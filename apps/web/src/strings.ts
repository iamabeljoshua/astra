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
  about: "Your tutor talks with you and draws as it explains. It's an AI, and setup takes under two minutes.",
  google: 'Continue with Google',
  email: 'Continue with email',
  agreementStart: 'By continuing you agree to the ',
  agreementJoin: ' and the ',
  agreementEnd: '.',
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

export const ONBOARDING_LABELS = {
  back: '\u2190 Back',
  next: 'Continue \u2192',
  progress: (stepNumber: number, stepCount: number) => `${stepNumber} of ${stepCount}`,
  nameQuestion: 'What should your tutor call you?',
  namePlaceholder: 'Your first name',
  nameMissing: 'Tell your tutor what to call you.',
  parentQuestion: 'A parent or guardian approves your account.',
  parentAbout: 'We send them one email. You can start as soon as they say yes.',
  parentPlaceholder: 'Their email address',
  parentInvalid: 'Enter a valid email address.',
  waitingQuestion: 'Waiting for your parent or guardian.',
  waitingAbout: 'We asked them to approve your account. This page moves on as soon as they say yes, and you can close it and come back.',
  useAnotherAddress: 'Use a different address',
  intoQuestion: 'What are you into?',
  intoAbout: 'Your tutor uses this to pick examples you care about.',
  intoPlaceholder: 'Be specific. Arsenal beats football.',
  intoOptions: ['Basketball', 'Football', 'Movies', 'Gaming', 'Music', 'Art', 'Space', 'Cars', 'Cooking', 'Fashion', 'Coding', 'History'],
  levelQuestion: 'Where are you in your learning?',
  goalQuestion: 'What brings you here?',
  voiceQuestion: "Pick your tutor's voice.",
  voiceAbout: 'Tap one to hear it. You can change it any time.',
  voiceNote: "For now these play through your device's own voices.",
  voiceMissing: 'Pick a voice to continue.',
  voiceSilent: 'This browser has no voice to play it with. You can still pick one.',
  voiceSample: (studentName: string) => `Hi ${studentName}. I will be your tutor.`,
  hello: (studentName: string, interest: string) =>
    `Hi ${studentName}. I'm your tutor, and I'm an AI. You said you're into ${interest}. What's one thing about it you've always wondered how it works?`,
  helloWithoutInterest: (studentName: string) =>
    `Hi ${studentName}. I'm your tutor, and I'm an AI. What's one thing you've always wondered how it works?`,
  speaking: 'Speaking',
  listening: 'Listening',
};

export const FIRST_ANSWER_BOX_LABELS = {
  label: 'Your answer',
  placeholder: 'Type your answer',
  placeholderWhileTalkIsOn: 'Talking opens soon. Type for now.',
  send: 'Send your answer',
};

export const STUDENT_LEVEL_LABELS = {
  middle_school: 'Middle school',
  high_school: 'High school',
  university: 'University',
  out_of_school: 'Out of school',
};

export const STUDENT_GOAL_LABELS = {
  class: 'A class I am taking',
  exam: 'An exam coming up',
  curiosity: 'Pure curiosity',
};

export const TUTOR_VOICE_LABELS = {
  ada: { name: 'Ada', about: 'Warm and unhurried' },
  kofi: { name: 'Kofi', about: 'Clear and steady' },
  noor: { name: 'Noor', about: 'Bright and quick' },
};

export const PROFILE_LABELS = {
  title: "Your tutor's notes",
  about: 'Your tutor teaches from these. Change anything here.',
  name: 'Name',
  firstQuestion: 'First question',
  save: 'Save changes',
  saved: 'Saved.',
  missing: 'Your name and first question cannot be blank.',
};

export const PARENT_CONSENT_LABELS = {
  question: (studentName: string | null) => `${studentName ?? 'Your child'} would like to use ${PRODUCT_NAME}.`,
  about: `${PRODUCT_NAME} is a learning app. An AI tutor talks with your child and draws as it explains. The tutor is an AI, and it can be wrong.`,
  stored: 'So far we hold their name, their date of birth, and your email address. If you accept, we also keep what they tell the tutor about their interests, their level, and their goals.',
  agreementStart: 'By accepting you confirm that you are their parent or guardian, and you agree to the ',
  agreementJoin: ' and the ',
  agreementEnd: '.',
  accept: 'I accept',
  acceptedQuestion: 'Thank you.',
  acceptedAbout: (studentName: string | null) => `${studentName ?? 'Your child'} can start now. You can close this page.`,
  loading: 'Opening this page.',
  deadLink: 'This link no longer works. The student may have asked a different address. Ask them to send a new one.',
  tryAgain: 'Try again',
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
  startHereLabel: 'Start here',
  startHereAbout: 'Your tutor is ready when you are.',
  startHereButton: 'Start session \u2192',
  picksLabel: 'Picked for you',
  pickDetails: (subject: string, lengthMinutes: number) => `${subject}, ${lengthMinutes} min`,
  loading: 'Loading your home screen.',
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

export const LEGAL_LABELS = {
  draftNotice: 'Draft of 3 November 2026. A lawyer has not yet reviewed this page.',
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
    intro: `These terms apply when you use ${PRODUCT_NAME}. A line marked planned describes something that is not built yet.`,
    sections: [
      {
        heading: `What ${PRODUCT_NAME} is`,
        today: [
          `${PRODUCT_NAME} is a learning app being built around an AI tutor. Today you can sign in, answer a few questions about yourself, and open a home screen with example lessons. The tutor's first hello is a fixed script, and lessons do not open yet.`,
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
          'If you are under 18, you give the email address of a parent or guardian, and the account waits until they accept through a link meant for them. An adult who accepts confirms that they are your parent or guardian and agrees to these terms.',
        ],
        planned: ["Sending the parent's consent link by email. Today the link is written to our server's log and no email goes out, so a parent cannot yet receive it."],
      },
      {
        heading: 'Your account',
        today: [
          'You sign in with a link sent to your email address, and you do not set a password. Use an address that belongs to you.',
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
    intro: `This page says what ${PRODUCT_NAME} collects today, who receives it, and what is planned. A line marked planned describes something that is not built yet, and no data moves for it.`,
    sections: [
      {
        heading: 'What we store',
        today: [
          "Your email address, the times you sign in, and a record of each sign-in. Supabase Auth, our sign-in service, keeps these. Its records include your IP address and your browser's description of itself.",
          'Your date of birth, if you are old enough to continue. We keep it in our database with an account ID and the time the record was made.',
          "The name you give your tutor, what you are into, your level, your goal, your choice of tutor voice, and your answer to the tutor's first question. We keep these in our database, and you can change them under Your notes.",
          "The words you type into the home screen's question box and any file you attach stay in your browser. They are not sent or stored. The app does not use your microphone.",
        ],
        planned: [
          "Each lesson's title, subject, language, length, transcript, and board drawings, kept while the account is active.",
        ],
      },
      {
        heading: 'In your browser',
        today: [
          'Your browser keeps your sign-in and your light or dark choice in local storage, and the address of the last sign-in link you asked for in session storage. The app sets no cookies and runs no analytics or advertising code.',
          "Voice samples and the tutor's first hello, which include your name and an interest, play only through voices built into your device, so those words are not sent to a voice service.",
        ],
        planned: [],
      },
      {
        heading: 'If you are under 13',
        today: [
          'If the date you confirm shows you are under 13 in every time zone, the account closes and we do not store that date.',
          'We keep a record holding only the account ID and the time, so the account stays closed on every later sign-in.',
          'Your email address is not deleted. It stays in Supabase Auth, in its user and identity records and in its logs, and nothing in the app removes it. We keep it for now because deleting it would let the same address sign up and answer again.',
        ],
        planned: [
          'Before any real student joins, deleting the address from Supabase Auth, including its logs, and refusing that address from then on by keeping only a keyed hash of it.',
        ],
      },
      {
        heading: 'If you are under 18',
        today: [
          "We ask for the email address of a parent or guardian. We store that address, a fingerprint of their consent link rather than the link, and the time they accept.",
          'Until they accept, we hold only your name, your date of birth, your account ID, and their address, and the app asks you nothing more.',
          "No email goes out yet. The consent link is written to our server's log, and anyone who can read that log could use it, so no real student under 18 can join until the email is built.",
        ],
        planned: [
          'Sending that link to the parent or guardian by email.',
          'A short summary for parents after each session, with no transcript.',
        ],
      },
      {
        heading: 'Who receives your data',
        today: [
          'Supabase runs our sign-in service and our database, so it holds everything listed under What we store, and it sends the sign-in email.',
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
          'We have no retention schedule, and nothing deletes data on a timer. What we store stays until we remove it by hand. The app has no delete button yet.',
        ],
        planned: ['A way for you or a parent to delete your data from the app.'],
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
