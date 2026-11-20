/**
 * Centralized Google AdMob configuration for Ganaka (Android).
 *
 * IMPORTANT FOR PLAY STORE RELEASE:
 * 1. Keep `useTestAds: true` during development and Debug APK testing.
 * 2. Before publishing to Google Play Store:
 *    - Replace `ANDROID_APP_ID` in `android/app/src/main/AndroidManifest.xml`
 *      with your real AdMob App ID (`ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`).
 *    - Paste your real Interstitial Video and App Open Ad Unit IDs below.
 *    - Set `useTestAds: false`.
 */

export const GOOGLE_TEST_AD_UNITS = {
  /** Official Google AdMob Android Test App ID (configured in AndroidManifest.xml) */
  appId: 'ca-app-pub-3940256099942544~3347511713',
  /** Official Google AdMob Android Interstitial Video Test Ad Unit ID */
  interstitialVideo: 'ca-app-pub-3940256099942544/8691691433',
  /** Official Google AdMob Android App Open Test Ad Unit ID */
  appOpen: 'ca-app-pub-3940256099942544/9257395921',
} as const;

export const PRODUCTION_AD_UNITS = {
  /** Replace with your real AdMob Interstitial Video Ad Unit ID before Play Store release */
  interstitialVideo: 'ca-app-pub-3940256099942544/8691691433',
  /** Replace with your real AdMob App Open Ad Unit ID before Play Store release */
  appOpen: 'ca-app-pub-3940256099942544/9257395921',
} as const;

export const ADMOB_CONFIG = {
  /** Keep true for Debug builds & testing; flip to false only after pasting real production IDs */
  useTestAds: true,
  /** Show an Interstitial Video ad after every 5 completed calculations */
  interstitialEveryNCalculations: 5,
  /** Maximum 4 Interstitial ads per rolling 12-hour window */
  interstitialMaxPer12Hours: 4,
  interstitialWindowMs: 12 * 60 * 60 * 1000,
  /** Minimum 60-minute gap between Interstitial ads to protect UX & AdMob policy compliance */
  interstitialMinCooldownMs: 60 * 60 * 1000,
  /** Maximum 2 App Open ads per rolling 24-hour window */
  appOpenMaxPer24Hours: 2,
  appOpenWindowMs: 24 * 60 * 60 * 1000,
  /** Minimum 6-hour gap between App Open ads so reopening within minutes never triggers an ad */
  appOpenMinCooldownMs: 6 * 60 * 60 * 1000,
  /** Minimum 2-minute buffer between different ad formats (App Open <-> Interstitial) */
  crossFormatMinGapMs: 2 * 60 * 1000,
  /** Maximum wait for cold-start App Open ad preload before silently skipping (never interrupts typing) */
  coldStartAppOpenWaitMs: 2500,
} as const;

export function getActiveAdUnitIds(): {
  interstitialAdUnitId: string;
  appOpenAdUnitId: string;
} {
  if (ADMOB_CONFIG.useTestAds) {
    return {
      interstitialAdUnitId: GOOGLE_TEST_AD_UNITS.interstitialVideo,
      appOpenAdUnitId: GOOGLE_TEST_AD_UNITS.appOpen,
    };
  }
  return {
    interstitialAdUnitId: PRODUCTION_AD_UNITS.interstitialVideo,
    appOpenAdUnitId: PRODUCTION_AD_UNITS.appOpen,
  };
}
