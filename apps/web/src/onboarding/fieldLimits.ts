export const MAX_NAME_LENGTH = 60;

const NULL_CHARACTER = '\u0000';
const LONE_SURROGATE = /\p{Cs}/u;
const VISIBLE_CHARACTER = /[^\p{Z}\p{Cc}\p{Cf}\p{M}\p{Default_Ignorable_Code_Point}\u2800\uFFFC\u{1D159}]/u;

export function isStorableName(name: string): boolean {
  return VISIBLE_CHARACTER.test(name) && !name.includes(NULL_CHARACTER) && !LONE_SURROGATE.test(name);
}
