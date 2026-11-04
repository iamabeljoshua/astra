/** A trusted adult or emergency help, in each language a student is likely to use, so a good reply in their language gets no English sentence added after it. It only ever adds help, so a word it lacks costs one extra sentence. */
const NAMES_HELP = /\b(?:adults?|grown-?ups?|emergency|parent|teacher|counsell?or|adulto|adultos|adulta|emergencias?|adulte|adultes|urgence|urgences|erwachsene\w*|notruf\w*|emergenza|adulti|emergência|взросл\w*|экстренн\w*|agbalagba|okenye|mtu mzima|dharura|pinagkakatiwalaan|orang dewasa|darurat|người lớn|khẩn cấp|yetişkin|acil|umuntu omdala|babba|gaggawa|bharosemand|bade)\b|वयस्क|बड़े|आपातकालीन|信任的大人|成年人|大人|紧急|急救|信頼できる大人|緊急|어른|응급|긴급|بالغ|طوارئ|الكبار|প্রাপ্তবয়স্ক|জরুরি|አዋቂ|ድንገተኛ|ndị okenye/iu;

/** How a reply about real danger opens and closes, unlike a first aid lesson that mentions an emergency number or an everyday "tell an adult". */
const SOUNDS_LIKE_CRISIS_REPLY = /\bthat sounds[^.?!]*serious\b|\bright thing telling me\b|\bare you safe\b/i;

const CANNOT_READ_IT = /\b(?:can'?t|cannot|couldn'?t)\s+(?:quite\s+)?(?:read|make (?:that|it|this) out|understand)\b|\bdidn'?t catch\b|\bgarbled\b/i;

const ASKS_TO_MAKE_A_WEAPON = /\b(?:make|build|print|mix|cook|synthes\w+)\b.*\b(?:bombs?|explosives?|guns?|thermite|napalm|meth|poisons?|nerve agents?|chlorine gas)\b/i;

const COMMON_ENGLISH_WORD = /\b(?:i|im|i'm|my|you|the|to|it|is|of|and|for|how|what|when|this|that|can|dont|wont|want|wanna|gonna|have|with|from|will|your|do|if|after|at)\b/i;

export const readsAsEnglish = (text: string): boolean => COMMON_ENGLISH_WORD.test(text);
export const namesHelp = (text: string): boolean => NAMES_HELP.test(text);
export const soundsLikeCrisisReply = (text: string): boolean => SOUNDS_LIKE_CRISIS_REPLY.test(text);
export const saysItCannotRead = (text: string): boolean => CANNOT_READ_IT.test(text);
export const asksToMakeAWeapon = (text: string): boolean => ASKS_TO_MAKE_A_WEAPON.test(text);
