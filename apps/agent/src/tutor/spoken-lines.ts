const IF_WORRIED = "If anything is worrying you, or you don't feel safe, please tell an adult you trust, or call your local emergency number.";

// A crisis line can arrive on any turn, and these may be the only words the student gets, so each line that ends a turn with no real reply names help.
export const SPOKEN_LINES = {
  stillWorking: ['One moment.', 'Let me think about that.', 'Let me work that out.'],
  stillThere: ['Still with you, nearly there.', 'Bear with me a moment.', 'Sorry, this is taking a little longer.'],
  couldNotReply: [`I can't reach my notes right now. ${IF_WORRIED} Ask me again in a moment?`, `Something's slow on my side. ${IF_WORRIED} Could you ask that again?`, `I lost my connection for a moment. ${IF_WORRIED} Would you ask me again?`],
  lostThread: ['Sorry, I lost my thread for a second.', 'Hold on, I lost my place.', 'Sorry, let me pick that back up.'],
  checkingMath: ['Hold on, let me check that.'],
  stuckHandBack: ["That one's hard, so let's slow right down. Tell me which bit feels most confusing."],
  mathDropped: ["Let's work this next bit out together. What would you try first?", "Let's do this next part together. What do you think comes next?"],
  drawingDropped: ["That didn't draw, so let's talk it through instead. Where do you want to start?", "The board wouldn't take that, so let's do it out loud. What do you want to look at first?"],
  refused: [
    `I can't go into that here, and you haven't done anything wrong by asking. ${IF_WORRIED} What would you like to do next?`,
    `That's one I can't talk about here, and that's down to me, not you. ${IF_WORRIED} What would you like to do next?`,
  ],
  refusedAfterWords: [`I have to stop there, and that's down to me, not you. ${IF_WORRIED} What would you like to do next?`],
  refusedPlain: ["I can't go into that one here, and you haven't done anything wrong by asking. What else are you working on?", "That one's not something I can help with here, and that's down to me, not you. What else are you working on?"],
  refusedPlainAfterWords: ["I have to stop there on that one, and that's down to me, not you. What else are you working on?"],
  askedHowDeclined: ["Let's come at that a different way. Which part do you want to go through first?"],
  cutShort: ["That's a lot at once, so I'll stop there. What do you make of it so far?"],
  noToolAnswer: [`I couldn't work that out just now. ${IF_WORRIED} Could you ask me that another way?`],
  notHeard: ["I didn't catch any words in that. Could you try again?"],
  safetyHelp: ['Please tell an adult you trust now, or call your local emergency number if you are in danger.'],
  sessionLimit: [`That's as far as I can go in this session. Please start a new session to carry on. ${IF_WORRIED}`],
  dailyLimit: [`That's all the tutor time for now. It resets once a day, so please try again later. ${IF_WORRIED}`],
  broken: [`Something's gone wrong on my side, and I can't fix it from here. Please start a new session to carry on. ${IF_WORRIED}`],
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
