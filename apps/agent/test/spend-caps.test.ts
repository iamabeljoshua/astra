import { describe, expect, it } from 'vitest';
import { createSpendCaps } from '../src/tutor/make-brain.ts';

const LIMITS = { sessionLimitUsd: 1, sessionVoiceLimitCharacters: 100 };

describe('the caps on one room', () => {
  it('stops the model past its session cap', () => {
    const caps = createSpendCaps({ link: null, ledger: null, trace: () => {}, ...LIMITS });
    caps.addTurn({ usd: 0.6, voiceCharacters: 0 });
    expect(caps.getSpendLimit()).toBeNull();
    caps.addTurn({ usd: 0.6, voiceCharacters: 0 });
    expect(caps.getSpendLimit()).toBe('sessionLimit');
  });

  it('stops the voice past its session cap', () => {
    const caps = createSpendCaps({ link: null, ledger: null, trace: () => {}, ...LIMITS });
    caps.addTurn({ usd: 0, voiceCharacters: 101 });
    expect(caps.getSpendLimit()).toBe('sessionLimit');
  });

  it('asks the shared ledger about both the model and the voice', () => {
    const makeLedger = (isOverVoice: boolean) => ({ charge: () => {}, read: () => ({ anthropicUsd: 0, voiceCharacters: 0, credits: 0 }), isOverModelLimit: () => false, countSharedPlays: () => 0, isOverVoiceLimit: () => isOverVoice });
    expect(createSpendCaps({ link: null, ledger: makeLedger(true), trace: () => {}, ...LIMITS }).getSpendLimit()).toBe('sessionLimit');
    expect(createSpendCaps({ link: null, ledger: makeLedger(false), trace: () => {}, ...LIMITS }).getSpendLimit()).toBeNull();
  });

  it('closes for the day when the API says the student is over', async () => {
    const caps = createSpendCaps({ link: { reportSpend: async () => ({ isOverDailyLimit: true }) }, ledger: null, trace: () => {}, ...LIMITS });
    caps.addTurn({ usd: 0.01, voiceCharacters: 0 });
    await caps.flush();
    expect(caps.getSpendLimit()).toBe('dailyLimit');
  });

  it('counts the voice in what it tells the API, because it is most of what a minute costs', async () => {
    const sent: number[] = [];
    const caps = createSpendCaps({ link: { reportSpend: async (usd) => (sent.push(usd), { isOverDailyLimit: false }) }, ledger: null, trace: () => {}, ...LIMITS });
    caps.addTurn({ usd: 0.01, voiceCharacters: 1000 });
    await caps.flush();
    expect(sent[0]).toBeCloseTo(0.05);
  });

  it('keeps a charge the API could not take, and sends it with the next one', async () => {
    const sent: number[] = [];
    let isDown = true;
    const link = {
      reportSpend: async (usd: number) => {
        if (isDown) throw new Error('down');
        sent.push(usd);
        return { isOverDailyLimit: false };
      },
    };
    const traces: string[] = [];
    const caps = createSpendCaps({ link, ledger: null, trace: (name) => traces.push(name), ...LIMITS });
    caps.addTurn({ usd: 0.25, voiceCharacters: 0 });
    await caps.flush();
    expect(traces).toContain('spendReportFailed');
    isDown = false;
    caps.addTurn({ usd: 0.5, voiceCharacters: 0 });
    await caps.flush();
    expect(sent).toEqual([0.75]);
  });
});
