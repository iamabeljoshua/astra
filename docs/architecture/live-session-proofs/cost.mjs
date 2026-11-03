import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BETA_MINUTES = 12000;
const TURNS_PER_MINUTE = 3;
const FLAT_PREFIX_TOKENS = 15000;
const NEW_INPUT_TOKENS = 1000;
const OUTPUT_TOKENS = 400;
const BACKGROUND_PER_MINUTE = 0.012;
const BUFFER = 1.3;
const SOLD_PER_HOUR = 49 / 5;
const SESSION_LIMIT_PER_MINUTE = 0.15;
const COMPACT_AT_TOKENS = 60000;
const SUMMARY_TOKENS = 4000;
const THIRTY_TURNS = 30;

const MODELS = {
  opus: { read: 0.2, write: 5, input: 4, output: 20, thinking: 200 },
  opusNoThinking: { read: 0.2, write: 5, input: 4, output: 20, thinking: 0 },
  sonnet: { read: 0.1, write: 2.5, input: 2, output: 10, thinking: 0 },
  haiku: { read: 0.01, write: 0.125, input: 0.1, output: 0.5, thinking: 0, over100k: { read: 0.05, write: 0.625, output: 2.5 } },
};

const OTHER_SERVICES = {
  cartesiaScale: 299 / BETA_MINUTES,
  deepgramNova3WithKeyterms: 0.0077 + 0.0013,
  liveKitShip: (50 + (BETA_MINUTES - 5000) * 0.01) / BETA_MINUTES,
};
const otherPerMinute = Object.values(OTHER_SERVICES).reduce((sum, value) => sum + value, 0);

function getRates(model, prefixTokens) {
  const rates = MODELS[model];
  return rates.over100k && prefixTokens + NEW_INPUT_TOKENS > 100000 ? { ...rates, ...rates.over100k } : rates;
}

function getTurnCost(model, prefixTokens) {
  const rates = getRates(model, prefixTokens);
  const outputTokens = OUTPUT_TOKENS + rates.thinking;
  const written = NEW_INPUT_TOKENS + outputTokens;
  return { dollars: (prefixTokens * rates.read + written * rates.write + outputTokens * rates.output) / 1e6, written };
}

function getFlatModelPerMinute(model) {
  const rates = MODELS[model];
  const outputTokens = OUTPUT_TOKENS + rates.thinking;
  return (TURNS_PER_MINUTE * (FLAT_PREFIX_TOKENS * rates.read + NEW_INPUT_TOKENS * rates.write + outputTokens * rates.output)) / 1e6;
}

// The prompt grows by each turn's input, output, and thinking, because history is append-only. Compaction reads the whole prefix once and writes a summary.
function getSessionModelCost({ model, minutes, compact = false }) {
  let prefixTokens = FLAT_PREFIX_TOKENS;
  let dollars = 0;
  for (let turn = 0; turn < minutes * TURNS_PER_MINUTE; turn++) {
    const { dollars: turnDollars, written } = getTurnCost(model, prefixTokens);
    dollars += turnDollars;
    prefixTokens += written;
    if (compact && prefixTokens >= COMPACT_AT_TOKENS) {
      const rates = getRates(model, prefixTokens);
      dollars += (prefixTokens * rates.read + SUMMARY_TOKENS * rates.output + SUMMARY_TOKENS * rates.write) / 1e6;
      prefixTokens = FLAT_PREFIX_TOKENS + SUMMARY_TOKENS;
    }
  }
  return { modelDollars: dollars, lastPrefixTokens: prefixTokens };
}

function withBackgroundAndBuffer(perMinute) {
  return (perMinute + BACKGROUND_PER_MINUTE) * BUFFER;
}

function describeSession(options) {
  const { modelDollars, lastPrefixTokens } = getSessionModelCost(options);
  const modelPerMinute = modelDollars / options.minutes;
  const allServices = modelPerMinute + otherPerMinute;
  return {
    ...options,
    modelDollars: round(modelDollars, 2),
    modelPerMinute: round(modelPerMinute, 4),
    allServicesPerMinute: round(allServices, 4),
    prdBasisPerMinute: round(withBackgroundAndBuffer(allServices), 4),
    overThePrdLimit: withBackgroundAndBuffer(allServices) > SESSION_LIMIT_PER_MINUTE,
    perHour: round(allServices * 60, 2),
    perHourWithBackgroundAndBuffer: round(withBackgroundAndBuffer(allServices) * 60, 2),
    lastPrefixTokens,
  };
}

function round(value, places) {
  return Number(value.toFixed(places));
}

function getBetaMonth(options) {
  const { modelDollars } = getSessionModelCost(options);
  const modelPerMinute = modelDollars / options.minutes;
  const allServices = modelPerMinute + otherPerMinute;
  return { modelAlone: Math.round(modelPerMinute * BETA_MINUTES), allFourServices: Math.round(allServices * BETA_MINUTES), withBackgroundAndBuffer: Math.round(withBackgroundAndBuffer(allServices) * BETA_MINUTES) };
}

function getThirtyTurnTestDollars(model) {
  const { modelDollars } = getSessionModelCost({ model, minutes: THIRTY_TURNS / TURNS_PER_MINUTE });
  return modelDollars + (FLAT_PREFIX_TOKENS * MODELS[model].write) / 1e6;
}

const flat = Object.fromEntries(
  ['opus', 'sonnet', 'haiku'].map((model) => {
    const modelPerMinute = getFlatModelPerMinute(model);
    const perMinute = modelPerMinute + otherPerMinute;
    return [model, { modelPerMinute: round(modelPerMinute, 4), allServicesPerMinute: round(perMinute, 4), perHour: round(perMinute * 60, 2), perHourWithBackgroundAndBuffer: round((perMinute + BACKGROUND_PER_MINUTE) * BUFFER * 60, 2), betaMonth: Math.round(perMinute * BETA_MINUTES) }];
  }),
);

// Read from livekit.com/pricing/inference: voices bill per character, not per minute.
const liveKitInference = {
  charactersPerMonth: 6e6,
  ttsCartesiaSonicPerMillionCharactersOnShip: 50,
  ttsCheapestVoicePerMillionCharactersOnShip: 15,
  sttNova3PerMinute: 0.0048,
  sttFluxPerMinute: 0.0065,
};
const CHARACTERS_IN_MILLIONS = liveKitInference.charactersPerMonth / 1e6;
const inferenceSpeech = { nova3: liveKitInference.sttNova3PerMinute * BETA_MINUTES, flux: liveKitInference.sttFluxPerMinute * BETA_MINUTES };

const MONTHLY = {
  liveKitShip: OTHER_SERVICES.liveKitShip * BETA_MINUTES,
  deepgramWithKeyterms: OTHER_SERVICES.deepgramNova3WithKeyterms * BETA_MINUTES,
  cartesiaScale: 299,
  // Startup's $49 includes 1.25M credits, and the other 4.75M cost $45 a million.
  cartesiaStartup: 49 + 4.75 * 45,
  inferenceCartesiaVoice: liveKitInference.ttsCartesiaSonicPerMillionCharactersOnShip * CHARACTERS_IN_MILLIONS,
  inferenceCheapestVoice: liveKitInference.ttsCheapestVoicePerMillionCharactersOnShip * CHARACTERS_IN_MILLIONS,
  ourServersLow: 60,
  ourServersHigh: 120,
};
const ownAccounts = { startup: MONTHLY.cartesiaStartup + MONTHLY.deepgramWithKeyterms, scale: MONTHLY.cartesiaScale + MONTHLY.deepgramWithKeyterms };
const ROUTES = {
  ownAccountsOnly: { low: ownAccounts.startup, high: ownAccounts.scale },
  cloudWithInference: { low: MONTHLY.liveKitShip + MONTHLY.inferenceCartesiaVoice + inferenceSpeech.nova3, high: MONTHLY.liveKitShip + MONTHLY.inferenceCartesiaVoice + inferenceSpeech.flux },
  cloudWithOwnAccounts: { low: MONTHLY.liveKitShip + ownAccounts.startup, high: MONTHLY.liveKitShip + ownAccounts.scale },
  allOursWithOwnAccounts: { low: MONTHLY.ourServersLow + ownAccounts.startup, high: MONTHLY.ourServersHigh + ownAccounts.scale },
  cloudWithCheapestInferenceVoice: { low: MONTHLY.liveKitShip + MONTHLY.inferenceCheapestVoice + inferenceSpeech.nova3, high: MONTHLY.liveKitShip + MONTHLY.inferenceCheapestVoice + inferenceSpeech.flux },
};

function getRouteMonth(route) {
  const modelPerMonth = (getSessionModelCost({ model: 'sonnet', minutes: 30, compact: true }).modelDollars / 30) * BETA_MINUTES;
  const allFour = modelPerMonth + route;
  return { route: Math.round(route), allFourWithSonnetCompaction: Math.round(allFour), withBackgroundAndBuffer: Math.round((allFour + BACKGROUND_PER_MINUTE * BETA_MINUTES) * BUFFER) };
}

const summary = {
  pricesReadOn: '2026-11-03',
  soldPerHourInPrdQ21: round(SOLD_PER_HOUR, 2),
  otherServicesPerMinute: Object.fromEntries(Object.entries(OTHER_SERVICES).map(([name, value]) => [name, round(value, 4)])),
  otherPerMinute: round(otherPerMinute, 4),
  flatPrefixAsInThePrd: flat,
  withHistoryGrowth: {
    opus18: describeSession({ model: 'opus', minutes: 18 }),
    opus30: describeSession({ model: 'opus', minutes: 30 }),
    opus60: describeSession({ model: 'opus', minutes: 60 }),
    sonnet60: describeSession({ model: 'sonnet', minutes: 60 }),
    haiku60: describeSession({ model: 'haiku', minutes: 60 }),
  },
  withCompactionAt60kTokens: {
    opus30: describeSession({ model: 'opus', minutes: 30, compact: true }),
    opus60: describeSession({ model: 'opus', minutes: 60, compact: true }),
    sonnet60: describeSession({ model: 'sonnet', minutes: 60, compact: true }),
    haiku60: describeSession({ model: 'haiku', minutes: 60, compact: true }),
  },
  betaMonth400Sessions30Minutes: {
    opusGrowing: getBetaMonth({ model: 'opus', minutes: 30 }),
    opusCompacting: getBetaMonth({ model: 'opus', minutes: 30, compact: true }),
    sonnetGrowing: getBetaMonth({ model: 'sonnet', minutes: 30 }),
    sonnetCompacting: getBetaMonth({ model: 'sonnet', minutes: 30, compact: true }),
    haikuGrowing: getBetaMonth({ model: 'haiku', minutes: 30 }),
    haikuCompacting: getBetaMonth({ model: 'haiku', minutes: 30, compact: true }),
    opusNoThinkingGrowing: getBetaMonth({ model: 'opusNoThinking', minutes: 30 }),
    opusNoThinkingCompacting: getBetaMonth({ model: 'opusNoThinking', minutes: 30, compact: true }),
  },
  compactionSavesPerMonth: {
    opus: getBetaMonth({ model: 'opus', minutes: 30 }).allFourServices - getBetaMonth({ model: 'opus', minutes: 30, compact: true }).allFourServices,
    sonnet: getBetaMonth({ model: 'sonnet', minutes: 30 }).allFourServices - getBetaMonth({ model: 'sonnet', minutes: 30, compact: true }).allFourServices,
  },
  thirtyTurnTestDollars: {
    opus: round(getThirtyTurnTestDollars('opus'), 2),
    sonnet: round(getThirtyTurnTestDollars('sonnet'), 2),
    haiku: round(getThirtyTurnTestDollars('haiku'), 2),
    allThree: round(['opus', 'sonnet', 'haiku'].reduce((sum, model) => sum + getThirtyTurnTestDollars(model), 0), 2),
  },
  picks: {
    note: 'Sonnet with compaction, Cartesia Scale, Deepgram Nova-3, LiveKit Ship, the top of the open route range. API hosting, about $200 a month by the PRD, is on top.',
    ...getBetaMonth({ model: 'sonnet', minutes: 30, compact: true }),
    hostingOnTop: 200,
  },
  thinking: {
    opusWithoutThinkingPerMinute: round((TURNS_PER_MINUTE * (FLAT_PREFIX_TOKENS * 0.2 + NEW_INPUT_TOKENS * 5 + OUTPUT_TOKENS * 20)) / 1e6, 3),
    opusWith200ThinkingTokensPerMinute: round(getFlatModelPerMinute('opus'), 3),
    millisecondsFor200TokensAt79PerSecond: Math.round((200 / 79) * 1000),
    millisecondsFor200TokensAt100PerSecond: 2000,
  },
  liveKitInferencePrices: liveKitInference,
  monthlyParts: Object.fromEntries(Object.entries(MONTHLY).map(([name, value]) => [name, round(value, 2)])),
  routesForVoiceSpeechAndHosting: Object.fromEntries(Object.entries(ROUTES).map(([name, { low, high }]) => [name, { low: getRouteMonth(low), high: getRouteMonth(high) }])),
};
writeFileSync(join(HERE, 'results', 'cost.json'), `${JSON.stringify(summary, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
