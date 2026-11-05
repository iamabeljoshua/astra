const NAMES_HELP = /\b(?:adults?|grown-?ups?|emergency|parent|teacher|counsell?or|adulto|adultos|adulta|emergencias?|adulte|adultes|urgence|urgences|erwachsene\w*|notruf\w*|emergenza|adulti|emergência|взросл\w*|экстренн\w*|agbalagba|okenye|mtu mzima|dharura|pinagkakatiwalaan|orang dewasa|darurat|người lớn|khẩn cấp|yetişkin|acil|umuntu omdala|babba|gaggawa|bharosemand|bade)\b|वयस्क|बड़े|आपातकालीन|信任的大人|成年人|大人|紧急|急救|信頼できる大人|緊急|어른|응급|긴급|بالغ|طوارئ|الكبار|প্রাপ্তবয়স্ক|জরুরি|አዋቂ|ድንገተኛ|ndị okenye/iu;

/** How a reply about real danger opens and closes, unlike a first aid lesson that mentions an emergency number or an everyday "tell an adult". */
const SOUNDS_LIKE_CRISIS_REPLY = /\bthat sounds[^.?!]*serious\b|\bright thing telling me\b|\bare you safe\b/i;

const CANNOT_READ_IT = /(?:^|[.!?]\s*|\bi\s+)(?:can'?t|cannot|couldn'?t)\s+(?:quite\s+)?(?:read|make (?:\S+\s+){0,4}out|understand)\b|\bisn'?t something i can read\b|\bdidn'?t (?:catch|come through)\b|\bgarbled\b|\bnot sure (?:i (?:read|caught)|what you mean)\b/i;

const ASKS_TO_MAKE_A_WEAPON = /\b(?:make|build|print|mix|cook|synthes\w+)\b.*\b(?:bombs?|explosives?|guns?|thermite|napalm|meth|poisons?|nerve agents?|chlorine gas)\b/i;

/** "I'm an AI, so I can't tell anyone or get help for you" can reach a child as nobody can help, and "I can't tell you what pill to take" cannot. */
const SAYS_NOBODY_CAN_BE_TOLD = /\b(?:can['’]?t|cannot|can not|won['’]?t|not able to|unable to|no way to)\s+(?:\w+\s+)?(?:tell|contact|reach|call|alert|inform|report to)\s+(?:anyone|anybody|someone|somebody|an adult|a person|the police)\b|\b(?:can['’]?t|cannot|can not|not able to|unable to|no way to)\s+(?:\w+\s+)?(?:get|find|send|call)\s+(?:\w+\s+)?help\b|\b(?:can['’]?t|cannot|can not|won['’]?t|not able to|unable to|no way to)\s+(?:\w+\s+)?pass\s+(?:\w+\s+)?on\b|\b(?:no ?one|nobody)\s+(?:can|could|will)\s+(?:help|be told|know)\b/i;

const COMMON_ENGLISH_WORD = /\b(?:i|im|i'm|my|you|the|to|it|is|of|and|for|how|what|when|this|that|can|dont|wont|want|wanna|gonna|have|with|from|will|your|do|if|after|at)\b/i;

export const readsAsEnglish = (text: string): boolean => COMMON_ENGLISH_WORD.test(text);
export const namesHelp = (text: string): boolean => NAMES_HELP.test(text);
export const soundsLikeCrisisReply = (text: string): boolean => SOUNDS_LIKE_CRISIS_REPLY.test(text);
export const saysItCannotRead = (text: string): boolean => CANNOT_READ_IT.test(text);
export const saysNobodyCanBeTold = (text: string): boolean => SAYS_NOBODY_CAN_BE_TOLD.test(text);
export const asksToMakeAWeapon = (text: string): boolean => ASKS_TO_MAKE_A_WEAPON.test(text);
