# Copies the proof's page, runner, and publisher into runs/attack, which git ignores, and adds attack variants of the chosen clock.
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'runs' / 'attack'
out.mkdir(parents=True, exist_ok=True)

page = (root / 'clock-page.js').read_text()
page = page.replace("'./clock-rejected.mjs'", "'../../clock-rejected.mjs'").replace("'./clock-rule.mjs'", "'../../clock-rule.mjs'")
variants = """
const ATTACKS = {
  openLate50: { openDelay: 50 }, openLate150: { openDelay: 150 }, openLate300: { openDelay: 300 }, openLate600: { openDelay: 600 },
  closeLate50: { closeDelay: 50 }, closeLate150: { closeDelay: 150 }, closeLate300: { closeDelay: 300 },
  bothLate150: { openDelay: 150, closeDelay: 150 },
  dropOpen: { dropOpen: true }, dropClose: { dropClose: true }, dropBoth: { dropOpen: true, dropClose: true },
  reversed: { openDelay: 1500 }, reliableOnly: { only: 'reliable' }, lossyOnly: { only: 'lossy' },
  dup: { dup: 3 },
};
function addAttackMethods(methods) {
  for (const name of Object.keys(ATTACKS)) {
    const clock = createWordClock();
    methods[name] = { clock, next: 0, position: (at) => clock.getPositionMs(at, firstWordStartMs()), isOpen: () => isBlockAudible };
  }
  return methods;
}
function deliverAttacks(message) {
  const thisSegment = segment;
  for (const [name, attack] of Object.entries(ATTACKS)) {
    if (attack.only && message.via !== attack.only) continue;
    const isOpen = message.ms === undefined;
    if (isOpen && attack.dropOpen) continue;
    if (!isOpen && attack.dropClose) continue;
    const delayMs = (isOpen ? attack.openDelay : attack.closeDelay) ?? 0;
    const times = attack.dup ?? 1;
    for (let index = 0; index < times; index++) {
      if (delayMs === 0 && index === 0) thisSegment.methods[name].clock.addGap(message);
      else setTimeout(() => thisSegment.methods[name].clock.addGap(message), delayMs + index * 15);
    }
  }
}
"""
page = page.replace("function createMethods(wordStartsMs) {", variants + "\nfunction createMethods(wordStartsMs) {")
page = page.replace("  return {\n    chosen: {", "  return addAttackMethods({\n    chosen: {")
page = page.replace("isOpen: () => isBlockAudible },\n  };\n}", "isOpen: () => isBlockAudible },\n  });\n}")
page = page.replace("segment.methods.chosen.clock.addGap(message);", "{ segment.methods.chosen.clock.addGap(message); deliverAttacks(message); }")
page = page.replace("function startClocks(atMs) {\n  for (const name of ['chosen', 'countOnly'])", "function startClocks(atMs) {\n  for (const name of ['chosen', 'countOnly', ...Object.keys(ATTACKS)])")
(out / 'clock-page.js').write_text(page)

pub = (root / 'clock-publisher.mjs').read_text()
pub = pub.replace("'./clock-rule.mjs'", "'../../clock-rule.mjs'")
# stallInPause: the stall lands in the middle of the pause before the nearest pause word. slowVoice: every frame later than real time. manyStalls: a stall every N words. stopInStall: stop while the voice is dry.
pub = pub.replace("""function placeStalls(wordStartsMs) {
  return (options.stalls ?? []).map((stall) => {""", """function placeStalls(wordStartsMs) {
  if (options.everyWords) {
    const list = [];
    for (let i = options.everyWords; i < wordStartsMs.length; i += options.everyWords) list.push({ ms: options.everyMs, wordIndex: i, atMs: wordStartsMs[i], isDone: false });
    return list;
  }
  return (options.stalls ?? []).map((stall) => {
    if (stall.inPause) {
      const pauseWord = Math.floor(Math.floor(wordStartsMs.length * stall.wordFraction) / options.pause.everyWords) * options.pause.everyWords;
      return { ms: stall.ms, wordIndex: pauseWord, atMs: wordStartsMs[pauseWord] - options.pause.ms / 2, isDone: false };
    }""")
pub = pub.replace("""      stall.isDone = true;
      await delay(AGENT_OUTPUT_QUEUE_MS + stall.ms);""", """      stall.isDone = true;
      await delay(AGENT_OUTPUT_QUEUE_MS + stall.ms);""")
pub = pub.replace("""    await source.captureFrame(new AudioFrame(piece, SAMPLE_RATE, 1, FRAME_SAMPLES));""", """    await source.captureFrame(new AudioFrame(piece, SAMPLE_RATE, 1, FRAME_SAMPLES));
    if (options.slowVoice) {
      if (offset === 0) { paceStart = Date.now(); paceFrames = 0; }
      paceFrames += 1;
      const due = paceStart + (paceFrames * FRAME_MS) / options.slowVoice;
      await delay(Math.max(0, due - Date.now()));
    }""")
pub = pub.replace("async function playSegment(", "let paceStart = 0;\nlet paceFrames = 0;\nasync function playSegment(")
(out / 'clock-publisher.mjs').write_text(pub)

run = (root / 'clock-run.mjs').read_text()
run = run.replace("'./clock-rejected.mjs'", "'../../clock-rejected.mjs'")
run = run.replace("const RUNS = join(HERE, 'runs', 'clock');", "const RUNS = process.env.ATTACK_OUT;")
scen = """
const SEG6 = { segments: 6 };
const SCENARIOS = {
  'a-stall-500': { options: { ...SEG6, stalls: stallOf(500) } },
  'a-stall-200': { options: { ...SEG6, stalls: stallOf(200) } },
  'a-stall-90': { options: { ...SEG6, stalls: stallOf(90) } },
  'a-stall-1500': { options: { ...SEG6, stalls: stallOf(1500) } },
  'a-stall-3500': { options: { ...SEG6, stalls: stallOf(3500) } },
  'a-stall-500-poor': { impair: POOR, options: { ...SEG6, stalls: stallOf(500) } },
  'a-two-close-300': { options: { ...SEG6, stalls: [{ wordFraction: MIDDLE, ms: 300, intoWordMs: 0 }, { wordFraction: MIDDLE, ms: 300, intoWordMs: 60 }] } },
  'a-two-close-100': { options: { ...SEG6, stalls: [{ wordFraction: MIDDLE, ms: 100, intoWordMs: 0 }, { wordFraction: MIDDLE, ms: 100, intoWordMs: 80 }] } },
  'a-in-pause': { options: { ...SEG6, pause: { everyWords: 4, ms: 600 }, stalls: [{ wordFraction: MIDDLE, ms: 400, inPause: true }] } },
  'a-pause-then-stall-poor': { impair: POOR, options: { ...SEG6, pause: { everyWords: 4, ms: 600 }, stalls: [{ wordFraction: MIDDLE, ms: 400, inPause: true }] } },
  'a-many-small': { options: { ...SEG6, everyWords: 2, everyMs: 40 } },
  'a-many-tiny': { options: { ...SEG6, everyWords: 2, everyMs: 15 } },
  'a-slow-voice-90': { options: { ...SEG6, slowVoice: 0.9 } },
  'a-slow-voice-97': { options: { ...SEG6, slowVoice: 0.97 } },
  'a-words-late-stall': { options: { ...SEG6, wordTimesLateMs: 1500, stalls: [{ wordFraction: 0.1, ms: 300 }] } },
};
"""
run = re.sub(r"const SCENARIOS = \{.*?\n\};\n", scen, run, count=1, flags=re.S)
run = run.replace("join(HERE, 'clock-publisher.mjs')", "join(HERE, 'clock-publisher.mjs')")
run = run.replace("const stallMs = segment.stalls.filter((stall) => stall.atMs <= startMs).reduce((sum, stall) => sum + stall.ms, 0);", "const stallMs = segment.stalls.filter((stall) => stall.atMs <= startMs).reduce((sum, stall) => sum + stall.ms, 0);")
(out / 'clock-run.mjs').write_text(run)
(out / 'clock-worklet.js').write_text((root / 'clock-worklet.js').read_text())
print('ok')
