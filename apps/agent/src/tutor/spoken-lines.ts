export const SPOKEN_LINES = {
  stillWorking: ['One moment.', 'Let me think about that.', 'Let me work that out.'],
  stillThere: ['Still with you, nearly there.', 'Bear with me a moment.', 'Sorry, this is taking a little longer.'],
  couldNotReply: ["I can't reach my notes right now. Ask me again in a moment?", "Something's slow on my side. Could you ask that again?", "I lost my connection for a moment. Would you ask me again?"],
  lostThread: ['Sorry, I lost my thread for a second.', 'Hold on, I lost my place.', 'Sorry, let me pick that back up.'],
  checkingMath: ['Hold on, let me check that.', 'Wait, that step needs checking.', "One second, I don't trust that line."],
  mathStillWrong: ["I can't back that step up yet, so I won't guess. What do you get if you try it?", "I'm not sure of that step, so let's not trust it. Can you work it through with me?"],
  refused: [
    "I can't go into that here, and you haven't done anything wrong by asking. If anything is worrying you, or you don't feel safe, please tell an adult you trust, or call your local emergency number. What would you like to do next?",
    "That's one I can't talk about here, and that's down to me, not you. If anything is worrying you, or you don't feel safe, please tell an adult you trust, or call your local emergency number. What would you like to do next?",
  ],
  refusedAfterWords: ["I have to stop there, and that's down to me, not you. If anything is worrying you, or you don't feel safe, please tell an adult you trust, or call your local emergency number. What would you like to do next?"],
  cutShort: ["That's a lot at once, so I'll stop there. What do you make of it so far?"],
  notHeard: ["I didn't catch any words in that. Could you try again?"],
  sessionLimit: ["That's as far as I can go in this session. Please start a new session to carry on."],
  dailyLimit: ["That's all the tutor time for today. Please come back tomorrow."],
  broken: ["Something's gone wrong on my side, and I can't fix it from here. Please start a new session to carry on."],
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
