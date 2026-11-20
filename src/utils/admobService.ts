import { Capacitor, registerPlugin } from '@capacitor/core';
import { ADMOB_CONFIG, getActiveAdUnitIds } from '../config/admobConfig';
import {
  AD_FREQUENCY_STORAGE_KEY,
  evaluateAppOpenEligibility,
  evaluateInterstitialOnCalculation,
  parseStoredAdFrequencyState,
  recordAppOpenShown,
  recordInterstitialShown,
  type AdFrequencyState,
} from './adFrequencyManager';

interface GanakaAdMobPlugin {
  initialize(): Promise<{ initialized: boolean; canRequestAds: boolean }>;
  preloadInterstitial(options: { adUnitId: string }): Promise<{ loaded: boolean }>;
  showInterstitial(): Promise<{ shown: boolean }>;
  preloadAppOpen(options: { adUnitId: string }): Promise<{ loaded: boolean }>;
  showAppOpen(options?: { waitForLoadMs?: number }): Promise<{ shown: boolean }>;
  cancelPendingAppOpen(): Promise<void>;
}

const GanakaAdMob = registerPlugin<GanakaAdMobPlugin>('GanakaAdMob');

let sdkInitialized = false;
let initInFlight: Promise<boolean> | null = null;
let adCurrentlyPresenting = false;

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function loadFrequencyState(now: number): AdFrequencyState {
  try {
    return parseStoredAdFrequencyState(
      localStorage.getItem(AD_FREQUENCY_STORAGE_KEY),
      now
    );
  } catch {
    return parseStoredAdFrequencyState(null, now);
  }
}

function saveFrequencyState(state: AdFrequencyState): void {
  try {
    localStorage.setItem(AD_FREQUENCY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Initializes Google UMP Consent + Google Mobile Ads SDK once on Android.
 * Silently no-ops on web browsers so desktop/mobile web preview never breaks.
 */
export async function initializeAdMob(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  if (sdkInitialized) return true;
  if (initInFlight) return initInFlight;

  initInFlight = (async () => {
    try {
      const result = await GanakaAdMob.initialize();
      if (result.initialized && result.canRequestAds) {
        sdkInitialized = true;
        const { interstitialAdUnitId, appOpenAdUnitId } = getActiveAdUnitIds();
        // Preload both formats quietly in background so future triggers are instant
        void GanakaAdMob.preloadAppOpen({ adUnitId: appOpenAdUnitId }).catch(() => {});
        void GanakaAdMob.preloadInterstitial({ adUnitId: interstitialAdUnitId }).catch(() => {});
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      initInFlight = null;
    }
  })();

  return initInFlight;
}

/**
 * Preloads ads cleanly (safe to call when network transitions offline -> online).
 */
export async function warmUpAdMobInventory(): Promise<void> {
  if (!isNativeAndroid()) return;
  const ready = await initializeAdMob();
  if (!ready) return;
  const { interstitialAdUnitId, appOpenAdUnitId } = getActiveAdUnitIds();
  void GanakaAdMob.preloadAppOpen({ adUnitId: appOpenAdUnitId }).catch(() => {});
  void GanakaAdMob.preloadInterstitial({ adUnitId: interstitialAdUnitId }).catch(() => {});
}

/**
 * Cancels any pending cold-start App Open wait if the user starts actively calculating.
 */
export function cancelPendingAppOpenAd(): void {
  if (!isNativeAndroid()) return;
  void GanakaAdMob.cancelPendingAppOpen().catch(() => {});
}

/**
 * Evaluates and displays an App Open ad when eligible:
 * - Max 2 per rolling 24 hours
 * - Minimum 6 hours between App Open ads (reopening after 2–5 minutes is blocked)
 * - Minimum 2-minute buffer after an Interstitial ad
 * - Never interrupts if `shouldAbort()` returns true (e.g., user already started typing)
 */
export async function maybeShowAppOpenAd(options?: {
  waitForLoadMs?: number;
  shouldAbort?: () => boolean;
}): Promise<boolean> {
  if (!isNativeAndroid() || adCurrentlyPresenting) return false;

  const now = Date.now();
  const state = loadFrequencyState(now);
  const eligibility = evaluateAppOpenEligibility(state, now);
  saveFrequencyState(eligibility.nextState);

  if (!eligibility.shouldShow) {
    return false;
  }

  const ready = await initializeAdMob();
  if (!ready || adCurrentlyPresenting || options?.shouldAbort?.()) {
    return false;
  }

  const { appOpenAdUnitId } = getActiveAdUnitIds();
  adCurrentlyPresenting = true;
  try {
    const res = await GanakaAdMob.showAppOpen({
      waitForLoadMs: options?.waitForLoadMs ?? 0,
    });
    if (res.shown) {
      const shownAt = Date.now();
      const updated = recordAppOpenShown(loadFrequencyState(shownAt), shownAt);
      saveFrequencyState(updated);
      // Preload next App Open ad quietly for a future eligible session
      void GanakaAdMob.preloadAppOpen({ adUnitId: appOpenAdUnitId }).catch(() => {});
      return true;
    }
    // If not ready yet, trigger a quiet background preload for next foreground resume
    void GanakaAdMob.preloadAppOpen({ adUnitId: appOpenAdUnitId }).catch(() => {});
    return false;
  } catch {
    return false;
  } finally {
    adCurrentlyPresenting = false;
  }
}

/**
 * Records a completed calculation and shows an Interstitial Video ad when eligible:
 * - Every 5 completed calculations
 * - Max 4 per rolling 12 hours
 * - Minimum 60 minutes between Interstitial ads
 * - Minimum 2-minute buffer after an App Open ad
 */
export async function recordCalculationAndMaybeShowInterstitial(): Promise<boolean> {
  const now = Date.now();
  const state = loadFrequencyState(now);
  const eligibility = evaluateInterstitialOnCalculation(state, now);
  saveFrequencyState(eligibility.nextState);

  if (!isNativeAndroid() || !eligibility.shouldShow || adCurrentlyPresenting) {
    return false;
  }

  const ready = await initializeAdMob();
  if (!ready || adCurrentlyPresenting) {
    return false;
  }

  const { interstitialAdUnitId } = getActiveAdUnitIds();
  adCurrentlyPresenting = true;
  try {
    const res = await GanakaAdMob.showInterstitial();
    if (res.shown) {
      const shownAt = Date.now();
      const updated = recordInterstitialShown(loadFrequencyState(shownAt), shownAt);
      saveFrequencyState(updated);
      // Quietly preload next interstitial for future eligible trigger
      void GanakaAdMob.preloadInterstitial({ adUnitId: interstitialAdUnitId }).catch(() => {});
      return true;
    }
    // If ad wasn't cached yet, preload quietly so future eligible trigger succeeds
    void GanakaAdMob.preloadInterstitial({ adUnitId: interstitialAdUnitId }).catch(() => {});
    return false;
  } catch {
    return false;
  } finally {
    adCurrentlyPresenting = false;
  }
}

export { ADMOB_CONFIG };
