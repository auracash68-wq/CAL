import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createInitialAdFrequencyState,
  DEFAULT_AD_POLICY,
  evaluateAppOpenEligibility,
  evaluateInterstitialOnCalculation,
  parseStoredAdFrequencyState,
  recordAppOpenShown,
  recordInterstitialShown,
} from './adFrequencyManager';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('Interstitial Video Ad frequency rules (5 calcs, max 4 / 12h, 60m cooldown)', () => {
  it('triggers only on the 5th completed calculation, never on 1..4', () => {
    const baseTime = 1_700_000_000_000;
    let state = createInitialAdFrequencyState();

    for (let i = 1; i <= 4; i++) {
      const res = evaluateInterstitialOnCalculation(state, baseTime + i * 1000);
      assert.equal(res.shouldShow, false);
      assert.equal(res.reason, 'interval_not_reached');
      state = res.nextState;
    }

    const fifth = evaluateInterstitialOnCalculation(state, baseTime + 5000);
    assert.equal(fifth.shouldShow, true);
    assert.equal(fifth.reason, 'eligible');
    assert.equal(fifth.nextState.calculationsSinceLastTrigger, 0);
  });

  it('blocks rapid subsequent 5-calculation bursts during the 60-minute cooldown', () => {
    const t0 = 1_700_000_000_000;
    let state = createInitialAdFrequencyState();

    // Reach 5th calculation and record shown
    for (let i = 0; i < 5; i++) {
      state = evaluateInterstitialOnCalculation(state, t0).nextState;
    }
    state = recordInterstitialShown(state, t0);

    // 5 more calculations 10 minutes later -> blocked by cooldown
    const t10m = t0 + 10 * MINUTE;
    let decision = evaluateInterstitialOnCalculation(state, t10m);
    for (let i = 1; i < 5; i++) {
      decision = evaluateInterstitialOnCalculation(decision.nextState, t10m + i * 1000);
    }
    assert.equal(decision.shouldShow, false);
    assert.equal(decision.reason, 'format_cooldown_active');

    // 5 more calculations 61 minutes later -> eligible again
    const t61m = t0 + 61 * MINUTE;
    decision = evaluateInterstitialOnCalculation(decision.nextState, t61m);
    for (let i = 1; i < 5; i++) {
      decision = evaluateInterstitialOnCalculation(decision.nextState, t61m + i * 1000);
    }
    assert.equal(decision.shouldShow, true);
    assert.equal(decision.reason, 'eligible');
  });

  it('strictly caps Interstitial ads at 4 per rolling 12-hour window and recovers after 12h', () => {
    const t0 = 1_700_000_000_000;
    let state = createInitialAdFrequencyState();

    // Show 4 interstitials spaced 2 hours apart (0h, 2h, 4h, 6h)
    for (let adNum = 0; adNum < 4; adNum++) {
      const now = t0 + adNum * 2 * HOUR;
      let res = evaluateInterstitialOnCalculation(state, now);
      for (let c = 1; c < 5; c++) {
        res = evaluateInterstitialOnCalculation(res.nextState, now + c * 1000);
      }
      assert.equal(res.shouldShow, true, `Ad #${adNum + 1} should be eligible`);
      state = recordInterstitialShown(res.nextState, now + 5000);
    }

    assert.equal(state.interstitialTimestamps.length, 4);

    // Attempt 5th interstitial at 8h (past 60m cooldown, still inside 12h window) -> BLOCKED
    const t8h = t0 + 8 * HOUR;
    let fifthAttempt = evaluateInterstitialOnCalculation(state, t8h);
    for (let c = 1; c < 5; c++) {
      fifthAttempt = evaluateInterstitialOnCalculation(fifthAttempt.nextState, t8h + c * 1000);
    }
    assert.equal(fifthAttempt.shouldShow, false);
    assert.equal(fifthAttempt.reason, 'window_cap_reached');

    // Attempt at 11h 55m -> STILL BLOCKED
    const t11h55m = t0 + 11 * HOUR + 55 * MINUTE;
    let lateAttempt = evaluateInterstitialOnCalculation(fifthAttempt.nextState, t11h55m);
    for (let c = 1; c < 5; c++) {
      lateAttempt = evaluateInterstitialOnCalculation(lateAttempt.nextState, t11h55m + c * 1000);
    }
    assert.equal(lateAttempt.shouldShow, false);
    assert.equal(lateAttempt.reason, 'window_cap_reached');

    // Attempt at 12h 1m -> 1st timestamp expired, now ELIGIBLE!
    const t12h1m = t0 + 12 * HOUR + 1 * MINUTE;
    let afterWindow = evaluateInterstitialOnCalculation(lateAttempt.nextState, t12h1m);
    for (let c = 1; c < 5; c++) {
      afterWindow = evaluateInterstitialOnCalculation(afterWindow.nextState, t12h1m + c * 1000);
    }
    assert.equal(afterWindow.shouldShow, true);
    assert.equal(afterWindow.reason, 'eligible');
  });
});

describe('App Open Ad frequency rules (max 2 / 24h, 6h cooldown)', () => {
  it('allows first open in 24h, blocks quick reopens (2m, 5m, 3h), allows 2nd after 6h, blocks 3rd..12th', () => {
    const t0 = 1_700_000_000_000;
    let state = createInitialAdFrequencyState();

    // 1st open -> eligible
    const open1 = evaluateAppOpenEligibility(state, t0);
    assert.equal(open1.shouldShow, true);
    assert.equal(open1.reason, 'eligible');
    state = recordAppOpenShown(open1.nextState, t0);

    // Reopen 2 minutes later -> blocked
    const open2m = evaluateAppOpenEligibility(state, t0 + 2 * MINUTE);
    assert.equal(open2m.shouldShow, false);
    assert.equal(open2m.reason, 'format_cooldown_active');

    // Reopen 5 minutes later -> blocked
    const open5m = evaluateAppOpenEligibility(state, t0 + 5 * MINUTE);
    assert.equal(open5m.shouldShow, false);
    assert.equal(open5m.reason, 'format_cooldown_active');

    // Reopen 3 hours later -> blocked
    const open3h = evaluateAppOpenEligibility(state, t0 + 3 * HOUR);
    assert.equal(open3h.shouldShow, false);
    assert.equal(open3h.reason, 'format_cooldown_active');

    // Reopen 6 hours + 1 minute later -> 2nd App Open eligible!
    const t6h1m = t0 + 6 * HOUR + 1 * MINUTE;
    const open2 = evaluateAppOpenEligibility(state, t6h1m);
    assert.equal(open2.shouldShow, true);
    assert.equal(open2.reason, 'eligible');
    state = recordAppOpenShown(open2.nextState, t6h1m);

    // Reopens 3..12 across hours 13..23 -> ALL blocked by 24h window cap!
    for (let h = 13; h <= 22; h++) {
      const attempt = evaluateAppOpenEligibility(state, t0 + h * HOUR);
      assert.equal(attempt.shouldShow, false, `Open at ${h}h must be blocked`);
      assert.equal(attempt.reason, 'window_cap_reached');
    }

    // Reopen at 24h + 1m -> oldest timestamp expired -> eligible again!
    const after24h = evaluateAppOpenEligibility(state, t0 + 24 * HOUR + 1 * MINUTE);
    assert.equal(after24h.shouldShow, true);
    assert.equal(after24h.reason, 'eligible');
  });
});

describe('Cross-format buffer & storage resilience', () => {
  it('prevents Interstitial immediately after an App Open ad within 2 minutes', () => {
    const t0 = 1_700_000_000_000;
    let state = createInitialAdFrequencyState();
    state = recordAppOpenShown(state, t0);

    // 5 fast calculations 30 seconds after App Open ad -> blocked by cross-format buffer
    const t30s = t0 + 30_000;
    let res = evaluateInterstitialOnCalculation(state, t30s);
    for (let c = 1; c < 5; c++) {
      res = evaluateInterstitialOnCalculation(res.nextState, t30s + c * 1000);
    }
    assert.equal(res.shouldShow, false);
    assert.equal(res.reason, 'cross_format_buffer_active');

    // 5 calculations after 3 minutes -> allowed
    const t3m = t0 + 3 * MINUTE;
    let res2 = evaluateInterstitialOnCalculation(res.nextState, t3m);
    for (let c = 1; c < 5; c++) {
      res2 = evaluateInterstitialOnCalculation(res2.nextState, t3m + c * 1000);
    }
    assert.equal(res2.shouldShow, true);
    assert.equal(res2.reason, 'eligible');
  });

  it('recovers cleanly from corrupted or invalid localStorage JSON', () => {
    const now = 1_700_000_000_000;
    const corrupted = parseStoredAdFrequencyState('{not valid json', now, DEFAULT_AD_POLICY);
    assert.deepEqual(corrupted, createInitialAdFrequencyState());

    const empty = parseStoredAdFrequencyState(null, now, DEFAULT_AD_POLICY);
    assert.deepEqual(empty, createInitialAdFrequencyState());

    const mixed = parseStoredAdFrequencyState(
      JSON.stringify({
        calculationsSinceLastTrigger: 3,
        interstitialTimestamps: [now - 13 * HOUR, now - 1 * HOUR, 'bad'],
        appOpenTimestamps: [now - 25 * HOUR, now - 2 * HOUR],
      }),
      now,
      DEFAULT_AD_POLICY
    );
    assert.equal(mixed.calculationsSinceLastTrigger, 3);
    assert.deepEqual(mixed.interstitialTimestamps, [now - 1 * HOUR]);
    assert.deepEqual(mixed.appOpenTimestamps, [now - 2 * HOUR]);
  });
});
