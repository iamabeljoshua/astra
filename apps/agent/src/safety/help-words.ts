/** A trusted adult or emergency help, in each language a student is likely to use, so a good reply in their language gets no English sentence added after it. It only ever adds help, so a word it lacks costs one extra sentence. */
const NAMES_HELP = /\b(?:adults?|grown-?ups?|emergency|parent|teacher|counsell?or|adulto|adultos|adulta|emergencias?|adulte|adultes|urgence|urgences|erwachsene\w*|notruf\w*|emergenza|adulti|emergência|взросл\w*|экстренн\w*|agbalagba|okenye|mtu mzima|dharura|pinagkakatiwalaan|orang dewasa|darurat|người lớn|khẩn cấp|yetişkin|acil|umuntu omdala|babba|gaggawa|bharosemand|bade)\b|वयस्क|बड़े|आपातकालीन|信任的大人|成年人|大人|紧急|急救|信頼できる大人|緊急|어른|응급|긴급|بالغ|طوارئ|الكبار|প্রাপ্তবয়স্ক|জরুরি|አዋቂ|ድንገተኛ|ndị okenye/iu;

/** Words only a reply about real danger uses, unlike "adult butterflies" or an everyday "if anything worries you, tell an adult". */
const PROMISES_EMERGENCY_HELP = /\bemergency (?:number|services)\b|\bthat sounds[^.?!]*serious\b|\bright thing telling me\b/i;

export const namesHelp = (text: string): boolean => NAMES_HELP.test(text);
export const promisesEmergencyHelp = (text: string): boolean => PROMISES_EMERGENCY_HELP.test(text);
