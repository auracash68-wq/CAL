import { ADMOB_CONFIG } from '../config/admobConfig';

export const AD_FREQUENCY_STORAGE_KEY = 'ganaka_ad_frequency_v1';

export interface AdFrequencyState {
  /** Number of completed calculations since the last interstitial eligibility check (0..N-1) */
  calculationsSinceLastTrigger: number;
  /** Epoch timestamps (ms) of Interstitial ads shown in the rolling 12-hour window */
  interstitialTimestamps: number[];
  /** Epoch timestamps (ms) of App Open ads shown in the rolling 24-hour window */
  appOpenTimestamps: number[];
}

export interface AdFrequencyPolicy {
  interstitialEveryNCalculations: number;
  interstitialMaxPerWindow: number;
  interstitialWindowMs: number;
  interstitialMinCooldownMs: number;
  appOpenMaxPerWindow: number;
  appOpenWindowMs: number;
  appOpenMinCooldownMs: number;
  crossFormatMinGapMs: number;
}

export const DEFAULT_AD_POLICY: AdFrequencyPolicy = {
  interstitialEveryNCalculations: ADMOB_CONFIG.interstitialEveryNCalculations,
  interstitialMaxPerWindow: ADMOB_CONFIG.interstitialMaxPer12Hours,
  interstitialWindowMs: ADMOB_CONFIG.interstitialWindowMs,
  interstitialMinCooldownMs: ADMOB_CONFIG.interstitialMinCooldownMs,
  appOpenMaxPerWindow: ADMOB_CONFIG.appOpenMaxPer24Hours,
  appOpenWindowMs: ADMOB_CONFIG.appOpenWindowMs,
  appOpenMinCooldownMs: ADMOB_CONFIG.appOpenMinCooldownMs,
  crossFormatMinGapMs: ADMOB_CONFIG.crossFormatMinGapMs,
};

export type AdDecisionReason =
  | 'eligible'
  | 'interval_not_reached'
  | 'window_cap_reached'
  | 'format_cooldown_active'
  | 'cross_format_buffer_active';

export interface AdEligibilityResult {
  shouldShow: boolean;
  reason: AdDecisionReason;
  nextState: AdFrequencyState;
}

export function createInitialAdFrequencyState(): AdFrequencyState {
  return {
    calculationsSinceLastTrigger: 0,
    interstitialTimestamps: [],
    appOpenTimestamps: [],
  };
}

function sanitizeTimestamps(raw: unknown, now: number, windowMs: number): number[] {
  if (!Array.isArray(raw)) return [];
  const cutoff = now - windowMs;
  return raw
    .filter(
      (item): item is number =>
        typeof item === 'number' &&
        Number.isFinite(item) &&
        item > cutoff &&
        item <= now + 60_000
    )
    .sort((a, b) => a - b);
}

/**
 * Removes expired timestamps outside their respective rolling windows.
 */
export function pruneAdFrequencyState(
  state: AdFrequencyState,
  now: number,
  policy: AdFrequencyPolicy = DEFAULT_AD_POLICY
): AdFrequencyState {
  return {
    calculationsSinceLastTrigger:
      Number.isInteger(state.calculationsSinceLastTrigger) &&
      state.calculationsSinceLastTrigger >= 0
        ? state.calculationsSinceLastTrigger
        : 0,
    interstitialTimestamps: sanitizeTimestamps(
      state.interstitialTimestamps,
      now,
      policy.interstitialWindowMs
    ),
    appOpenTimestamps: sanitizeTimestamps(
      state.appOpenTimestamps,
      now,
      policy.appOpenWindowMs
    ),
  };
}

/**
 * Safely parses persisted JSON state, resetting cleanly on missing or corrupted data.
 */
export function parseStoredAdFrequencyState(
  rawJson: string | null,
  now: number,
  policy: AdFrequencyPolicy = DEFAULT_AD_POLICY
): AdFrequencyState {
  if (!rawJson) return createInitialAdFrequencyState();
  try {
    const parsed = JSON.parse(rawJson) as Partial<AdFrequencyState>;
    if (!parsed || typeof parsed !== 'object') {
      return createInitialAdFrequencyState();
    }
    return pruneAdFrequencyState(
      {
        calculationsSinceLastTrigger:
          typeof parsed.calculationsSinceLastTrigger === 'number'
            ? parsed.calculationsSinceLastTrigger
            : 0,
        interstitialTimestamps: Array.isArray(parsed.interstitialTimestamps)
          ? parsed.interstitialTimestamps
          : [],
        appOpenTimestamps: Array.isArray(parsed.appOpenTimestamps)
          ? parsed.appOpenTimestamps
          : [],
      },
      now,
      policy
    );
  } catch {
    return createInitialAdFrequencyState();
  }
}

function getLatestTimestamp(timestamps: number[]): number | null {
  if (timestamps.length === 0) return null;
  return timestamps[timestamps.length - 1];
}

/**
 * Records a completed calculation and evaluates whether an Interstitial Video ad
 * is eligible to display under all frequency caps and cooldown rules.
 *
 * NOTE: This does NOT consume an impression quota until `recordInterstitialShown`
 * is called after the native ad actually displays.
 */
export function evaluateInterstitialOnCalculation(
  state: AdFrequencyState,
  now: number,
  policy: AdFrequencyPolicy = DEFAULT_AD_POLICY
): AdEligibilityResult {
  const pruned = pruneAdFrequencyState(state, now, policy);
  const nextCount = pruned.calculationsSinceLastTrigger + 1;

  if (nextCount < policy.interstitialEveryNCalculations) {
    return {
      shouldShow: false,
      reason: 'interval_not_reached',
      nextState: {
        ...pruned,
        calculationsSinceLastTrigger: nextCount,
      },
    };
  }

  // Reached Nth calculation: reset cycle counter so we only evaluate every N calculations
  const cycledState: AdFrequencyState = {
    ...pruned,
    calculationsSinceLastTrigger: 0,
  };

  if (cycledState.interstitialTimestamps.length >= policy.interstitialMaxPerWindow) {
    return {
      shouldShow: false,
      reason: 'window_cap_reached',
      nextState: cycledState,
    };
  }

  const lastInterstitial = getLatestTimestamp(cycledState.interstitialTimestamps);
  if (
    lastInterstitial !== null &&
    now - lastInterstitial < policy.interstitialMinCooldownMs
  ) {
    return {
      shouldShow: false,
      reason: 'format_cooldown_active',
      nextState: cycledState,
    };
  }

  const lastAppOpen = getLatestTimestamp(cycledState.appOpenTimestamps);
  if (lastAppOpen !== null && now - lastAppOpen < policy.crossFormatMinGapMs) {
    return {
      shouldShow: false,
      reason: 'cross_format_buffer_active',
      nextState: cycledState,
    };
  }

  return {
    shouldShow: true,
    reason: 'eligible',
    nextState: cycledState,
  };
}

/**
 * Records that an Interstitial ad was actually shown on screen.
 */
export function recordInterstitialShown(
  state: AdFrequencyState,
  now: number,
  policy: AdFrequencyPolicy = DEFAULT_AD_POLICY
): AdFrequencyState {
  const pruned = pruneAdFrequencyState(state, now, policy);
  return {
    ...pruned,
    calculationsSinceLastTrigger: 0,
    interstitialTimestamps: [...pruned.interstitialTimestamps, now],
  };
}

/**
 * Evaluates whether an App Open ad is eligible to display on app open / foreground resume.
 *
 * Enforces:
 * - Maximum 2 App Open ads per rolling 24-hour window
 * - Minimum 6-hour cooldown between App Open ads (reopening after 2–5 minutes is always blocked)
 * - Minimum 2-minute cross-format buffer after an Interstitial ad
 */
export function evaluateAppOpenEligibility(
  state: AdFrequencyState,
  now: number,
  policy: AdFrequencyPolicy = DEFAULT_AD_POLICY
): AdEligibilityResult {
  const pruned = pruneAdFrequencyState(state, now, policy);

  if (pruned.appOpenTimestamps.length >= policy.appOpenMaxPerWindow) {
    return {
      shouldShow: false,
      reason: 'window_cap_reached',
      nextState: pruned,
    };
  }

  const lastAppOpen = getLatestTimestamp(pruned.appOpenTimestamps);
  if (lastAppOpen !== null && now - lastAppOpen < policy.appOpenMinCooldownMs) {
    return {
      shouldShow: false,
      reason: 'format_cooldown_active',
      nextState: pruned,
    };
  }

  const lastInterstitial = getLatestTimestamp(pruned.interstitialTimestamps);
  if (
    lastInterstitial !== null &&
    now - lastInterstitial < policy.crossFormatMinGapMs
  ) {
    return {
      shouldShow: false,
      reason: 'cross_format_buffer_active',
      nextState: pruned,
    };
  }

  return {
    shouldShow: true,
    reason: 'eligible',
    nextState: pruned,
  };
}

/**
 * Records that an App Open ad was actually shown on screen.
 */
export function recordAppOpenShown(
  state: AdFrequencyState,
  now: number,
  policy: AdFrequencyPolicy = DEFAULT_AD_POLICY
): AdFrequencyState {
  const pruned = pruneAdFrequencyState(state, now, policy);
  return {
    ...pruned,
    appOpenTimestamps: [...pruned.appOpenTimestamps, now],
  };
}
