// Code's own reading of words before anything is remembered. These lean toward refusing, because a lost note costs little and a stored disclosure about a minor costs a lot.

/** Any of these in a room means nothing from that room is remembered. */
const CRISIS_WORDS = [
  /\b(?:kill(?:ing)?\s*(?:my\s?self|me)|kms|suicid\w*|sewerslide|unalive|end(?:ing)? (?:it all|my life)|(?:want|wanted|wanna|going) to die|wanna die|achoro m inwu)\b/i,
  /\b(?:don'?t|do not) want to (?:be alive|live|be here|wake up)\b|\bbetter off without me\b|\bplan for how to do it\b|\b(?:not|never) wake up\b|\bhow many (?:pills|tablets|paracetamol)\b/i,
  /\b(?:hurt(?:ing)?|harm(?:ing)?|cut(?:ting)?) my\s?self\b|\bself[- ]?harm\w*\b|\boverdos\w*\b|\bmy blade\b|\bblade (?:in|under|on) my\b/i,
  /\b(?:hits?|hitting|beats?|beating|touch(?:es|ed|ing)?|hurts?|hurting|threaten(?:s|ed)?) me\b|\bwith a belt\b|\b(?:rape|raped|molest\w*|abuse[ds]?|abusing|groom(?:ed|ing)?|nudes?|bruises?)\b/i,
  /\bscared to go home\b|\b(?:i'?m|i am|am i|feel) (?:not )?(?:unsafe|in danger|safe)\b|\bsecrets? from my (?:parents|mum|mom|dad)\b|\bkeep (?:our|this|it) (?:chats? )?secret\b/i,
];

/** Said by the tutor when its safety rules fire, so a crisis worded in a way code missed still stops the note. */
const TUTOR_SAFETY_WORDS = /\bthat sounds serious\b|\byou did the right thing telling me\b|\bemergency number\b|\b(?:an )?adult (?:you|they) trust\b/i;

/** About the student's own life rather than what they are learning, so it is dropped wherever it appears. */
const PERSONAL_WORDS = [
  /\bmy\s+(?:(?:step|grand|foster)\w*|mum|mom|mother|dad|father|parents?|brother|sister|siblings?|aunt\w*|uncle|cousins?|family|guardian|boyfriend|girlfriend|bf|gf|crush|(?:best )?friends?)\b|\b(?:divorce|custody|foster care)\b/i,
  /\bmy\s+(?:period|doctor|therapist|meds|medication|pills?|diagnosis|anxiety|depression|adhd|autism|dyslexia|allerg\w+|asthma|diabetes|weight|body|health|illness)\b|\bi(?:'m| am| have| got)\s+(?:adhd|autis\w+|dyslexi\w+|depress\w+|anxiety|anxious|sick|ill|diabet\w+)\b|\b(?:pregnan\w+|therapy|anorexi\w+|bulimi\w+|eating disorder|panic attacks?|bull(?:y|ied|ying))\b/i,
  /\b(?:i'?m|i am|i feel|i'?ve been feeling|feeling)\s+(?:so |really |very |just )?(?:sad|depressed|lonely|alone|hopeless|worthless|stupid|dumb|useless|scared|afraid|anxious|stressed|overwhelmed|upset|terrible|awful|crying)\b|\bhate (?:my\s?self|my life)\b|\bnobody (?:cares|likes me|gets me)\b|\bcrying\b/i,
  /\bmy (?:school|address|phone|number|email|teacher|class|house|street|town|city|real name|surname|last name|age)\b|\bi live (?:in|at|on)\b|\bi go to\b|\b[\w.+-]+@[\w-]+\.\w+\b|\b\d[\d\s().-]{6,}\d\b/i,
  /\bi'?m (?:gay|lesbian|bi|bisexual|trans|queer|muslim|christian|jewish|hindu|buddhist|atheist)\b|\bmy (?:religion|faith|church|mosque|temple|sexuality|gender)\b/i,
];

const INSTRUCTION_WORDS = [
  /\b(?:ignore|disregard|forget|override|bypass)\b.{0,40}\b(?:rules?|instructions?|prompt|previous|above|everything|safety)\b/i,
  /\b(?:system|developer|admin)\s*(?:prompt|message|note|mode|says?)\b|\bjailbreak\b|\bdo anything now\b|\bnew (?:rules?|instructions?)\b/i,
  /\byou (?:are|must|should|will|have to|need to|may|can now)\b|\bfrom now on\b|\bact as\b|\bpretend\b|\brole-?play\b/i,
  /\b(?:always|never) (?:say|call|answer|tell|give|ask|reply|mention)\b|\bcall me\b|\btell (?:the student|them|him|her)\b|\btell me (?:that|the answer)\b|\brepeat (?:this|after|your)\b|\bsay (?:that|the word)\b/i,
  /\bremember (?:that|this)\b|\b(?:write|save|store|record) (?:a |this |that )?(?:note|fact|down)\b|\bnote that\b/i,
];

const NOT_PLAIN_WORDS = /[{}<>[\]`\\|#~]/;

const matchesAny = (patterns: readonly RegExp[], text: string) => patterns.some((pattern) => pattern.test(text));

export const isCrisis = (studentText: string) => matchesAny(CRISIS_WORDS, studentText);
export const isTutorSafetyLine = (spokenText: string) => TUTOR_SAFETY_WORDS.test(spokenText);
export const isPersonal = (text: string) => matchesAny(PERSONAL_WORDS, text);
export const isInstruction = (text: string) => matchesAny(INSTRUCTION_WORDS, text);

/** What may be kept of a line of the student's. */
export const isSafeToRemember = (text: string) => !isCrisis(text) && !isPersonal(text) && !isInstruction(text);

/** What may be written or read as a note's own words, which are plain words only. */
export const isSafeNoteText = (text: string) => isSafeToRemember(text) && !NOT_PLAIN_WORDS.test(text) && !isTutorSafetyLine(text);
