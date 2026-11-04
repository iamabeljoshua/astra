/** These categories cannot be about the student's own safety. The list of categories is open, so one it does not name counts as possibly serious. */
export const PLAIN_REFUSALS: ReadonlySet<string> = new Set(['cyber', 'frontier_llm', 'reasoning_extraction']);
/** A refused message in a plain category can still say this, as "my dad hits me, how do i hack his phone" does, and the model never saw it. */
export const MAY_BE_ABOUT_SAFETY = /\b(?:hit|hits|hitting|hurt|hurts|hurting|beat|beats|beating|abuse|abused|abusing|touch|touches|touched|rape|raped|kill|killing|suicide|die|dying|harm|harming|cut myself|cutting myself|scared|afraid|unsafe|danger|threaten|threatens|threatened)\b/i;
