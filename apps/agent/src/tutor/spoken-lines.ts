export const SPOKEN_LINES = {
  stillWorking: ['One moment.', 'Let me think about that.', 'Let me work that out.'],
  stillThere: ['Still with you, nearly there.', 'Bear with me a moment.', 'Sorry, this is taking a little longer.'],
  couldNotReply: ["I can't reach my notes right now. Ask me again in a moment?", "Something's slow on my side. Could you ask that again?", "I lost my connection for a moment. Would you ask me again?"],
  lostThread: ['Sorry, I lost my thread for a second.', 'Hold on, I lost my place.', 'Sorry, let me pick that back up.'],
  checkingMath: ['Hold on, let me check that.', 'Wait, that step needs checking.', "One second, I don't trust that line."],
  mathStillWrong: ["I can't back that step up yet, so I won't guess. What do you get if you try it?", "I'm not sure of that step, so let's not trust it. Can you work it through with me?"],
  refused: ["I can't help with that one here. What else are you working on?", "That's not something I can go into. What would you like to look at instead?"],
  refusedAfterWords: ["I'll stop there, because I can't go further on this. What else are you working on?"],
} as const;

export type SpokenLineUse = keyof typeof SPOKEN_LINES;

const PICKS_BEFORE_A_REPEAT = 3;

// Skips a line said in the last two picks when its list has another, because a repeated phrase turns into a tic.
export function createLinePicker() {
  const nextIndex = new Map<SpokenLineUse, number>();
  const recent: string[] = [];
  return (use: SpokenLineUse): string => {
    const lines: readonly string[] = SPOKEN_LINES[use];
    const start = nextIndex.get(use) ?? 0;
    const ordered = lines.map((_, offset) => lines[(start + offset) % lines.length] as string);
    const picked = ordered.find((line) => !recent.includes(line)) ?? (ordered[0] as string);
    nextIndex.set(use, (lines.indexOf(picked) + 1) % lines.length);
    recent.push(picked);
    if (recent.length > PICKS_BEFORE_A_REPEAT - 1) recent.shift();
    return picked;
  };
}
