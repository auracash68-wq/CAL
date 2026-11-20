package in.ganaka.calculator;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.appopen.AppOpenAd;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import java.util.Date;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Native Capacitor 8 bridge for Google AdMob (Interstitial Video + App Open)
 * and Google User Messaging Platform (UMP) consent on Android.
 */
@CapacitorPlugin(name = "GanakaAdMob")
public class GanakaAdMobPlugin extends Plugin {

    private static final String TAG = "GanakaAdMob";
    private static final long APP_OPEN_FRESHNESS_MS = 4L * 3600000L; // 4 hours per Google AdMob guidelines
    private static final int MAX_APP_OPEN_WAIT_MS = 3000;

    private final AtomicBoolean isMobileAdsInitialized = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private InterstitialAd interstitialAd = null;
    private boolean isLoadingInterstitial = false;

    private AppOpenAd appOpenAd = null;
    private long appOpenLoadTimeMs = 0L;
    private boolean isLoadingAppOpen = false;

    private boolean isShowingFullScreenAd = false;

    private Runnable pendingAppOpenCallback = null;
    private Runnable pendingAppOpenCancel = null;
    private Runnable pendingAppOpenTimeout = null;

    @PluginMethod
    public void initialize(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            resolveInit(call, false, false);
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                ConsentRequestParameters params = new ConsentRequestParameters.Builder()
                        .setTagForUnderAgeOfConsent(false)
                        .build();
                ConsentInformation consentInfo = UserMessagingPlatform.getConsentInformation(activity);

                consentInfo.requestConsentInfoUpdate(
                        activity,
                        params,
                        () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(
                                activity,
                                formError -> {
                                    if (formError != null) {
                                        Log.w(TAG, "UMP consent form notice: " + formError.getMessage());
                                    }
                                    if (consentInfo.canRequestAds()) {
                                        initializeMobileAdsSdk(activity, call);
                                    } else {
                                        resolveInit(call, false, false);
                                    }
                                }
                        ),
                        requestError -> {
                            Log.w(TAG, "UMP consent update unavailable: " + requestError.getMessage());
                            if (consentInfo.canRequestAds()) {
                                initializeMobileAdsSdk(activity, call);
                            } else {
                                resolveInit(call, false, false);
                            }
                        }
                );
            } catch (Exception ex) {
                Log.w(TAG, "AdMob init error: " + ex.getMessage());
                resolveInit(call, false, false);
            }
        });
    }

    private void initializeMobileAdsSdk(Activity activity, PluginCall call) {
        if (isMobileAdsInitialized.getAndSet(true)) {
            resolveInit(call, true, true);
            return;
        }
        try {
            MobileAds.initialize(activity, initializationStatus -> resolveInit(call, true, true));
        } catch (Exception ex) {
            isMobileAdsInitialized.set(false);
            Log.w(TAG, "MobileAds.initialize failed: " + ex.getMessage());
            resolveInit(call, false, false);
        }
    }

    private void resolveInit(PluginCall call, boolean initialized, boolean canRequestAds) {
        JSObject result = new JSObject();
        result.put("initialized", initialized);
        result.put("canRequestAds", canRequestAds);
        call.resolve(result);
    }

    @PluginMethod
    public void preloadInterstitial(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        Activity activity = getActivity();
        if (adUnitId == null || adUnitId.isEmpty() || activity == null || activity.isFinishing()) {
            JSObject result = new JSObject();
            result.put("loaded", false);
            call.resolve(result);
            return;
        }

        activity.runOnUiThread(() -> {
            if (interstitialAd != null) {
                JSObject result = new JSObject();
                result.put("loaded", true);
                call.resolve(result);
                return;
            }
            if (isLoadingInterstitial) {
                JSObject result = new JSObject();
                result.put("loaded", false);
                call.resolve(result);
                return;
            }

            isLoadingInterstitial = true;
            AdRequest adRequest = new AdRequest.Builder().build();
            InterstitialAd.load(
                    activity.getApplicationContext(),
                    adUnitId,
                    adRequest,
                    new InterstitialAdLoadCallback() {
                        @Override
                        public void onAdLoaded(@NonNull InterstitialAd ad) {
                            interstitialAd = ad;
                            isLoadingInterstitial = false;
                            JSObject result = new JSObject();
                            result.put("loaded", true);
                            call.resolve(result);
                        }

                        @Override
                        public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                            Log.d(TAG, "Interstitial failed to load: " + loadAdError.getMessage());
                            interstitialAd = null;
                            isLoadingInterstitial = false;
                            JSObject result = new JSObject();
                            result.put("loaded", false);
                            call.resolve(result);
                        }
                    }
            );
        });
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            resolveShown(call, false);
            return;
        }

        activity.runOnUiThread(() -> {
            if (isShowingFullScreenAd || interstitialAd == null) {
                resolveShown(call, false);
                return;
            }

            final InterstitialAd adToShow = interstitialAd;
            interstitialAd = null;
            isShowingFullScreenAd = true;
            final AtomicBoolean resolved = new AtomicBoolean(false);

            adToShow.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override
                public void onAdDismissedFullScreenContent() {
                    isShowingFullScreenAd = false;
                    if (resolved.compareAndSet(false, true)) {
                        resolveShown(call, true);
                    }
                }

                @Override
                public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                    Log.d(TAG, "Interstitial failed to show: " + adError.getMessage());
                    isShowingFullScreenAd = false;
                    if (resolved.compareAndSet(false, true)) {
                        resolveShown(call, false);
                    }
                }
            });

            try {
                adToShow.show(activity);
            } catch (Exception ex) {
                Log.w(TAG, "Interstitial show exception: " + ex.getMessage());
                isShowingFullScreenAd = false;
                if (resolved.compareAndSet(false, true)) {
                    resolveShown(call, false);
                }
            }
        });
    }

    @PluginMethod
    public void preloadAppOpen(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        Activity activity = getActivity();
        if (adUnitId == null || adUnitId.isEmpty() || activity == null || activity.isFinishing()) {
            JSObject result = new JSObject();
            result.put("loaded", false);
            call.resolve(result);
            return;
        }

        activity.runOnUiThread(() -> {
            if (isAppOpenAdAvailable()) {
                JSObject result = new JSObject();
                result.put("loaded", true);
                call.resolve(result);
                return;
            }
            if (isLoadingAppOpen) {
                JSObject result = new JSObject();
                result.put("loaded", false);
                call.resolve(result);
                return;
            }

            isLoadingAppOpen = true;
            AdRequest adRequest = new AdRequest.Builder().build();
            AppOpenAd.load(
                    activity.getApplicationContext(),
                    adUnitId,
                    adRequest,
                    new AppOpenAd.AppOpenAdLoadCallback() {
                        @Override
                        public void onAdLoaded(@NonNull AppOpenAd ad) {
                            appOpenAd = ad;
                            appOpenLoadTimeMs = new Date().getTime();
                            isLoadingAppOpen = false;
                            notifyPendingAppOpenWaiter();
                            JSObject result = new JSObject();
                            result.put("loaded", true);
                            call.resolve(result);
                        }

                        @Override
                        public void onAdFailedToLoad(@NonNull LoadAdError loadAdError) {
                            Log.d(TAG, "App Open failed to load: " + loadAdError.getMessage());
                            appOpenAd = null;
                            isLoadingAppOpen = false;
                            notifyPendingAppOpenWaiter();
                            JSObject result = new JSObject();
                            result.put("loaded", false);
                            call.resolve(result);
                        }
                    }
            );
        });
    }

    @PluginMethod
    public void showAppOpen(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            resolveShown(call, false);
            return;
        }

        int requestedWaitMs = call.getInt("waitForLoadMs", 0);
        int waitMs = Math.max(0, Math.min(requestedWaitMs, MAX_APP_OPEN_WAIT_MS));

        activity.runOnUiThread(() -> {
            if (isShowingFullScreenAd) {
                resolveShown(call, false);
                return;
            }

            if (isAppOpenAdAvailable()) {
                presentAppOpenAd(activity, call);
                return;
            }

            if (isLoadingAppOpen && waitMs > 0) {
                clearPendingAppOpenWaiter();
                final AtomicBoolean handled = new AtomicBoolean(false);

                pendingAppOpenCallback = () -> {
                    if (!handled.compareAndSet(false, true)) return;
                    clearPendingAppOpenWaiter();
                    if (!activity.isFinishing() && !activity.isDestroyed() && isAppOpenAdAvailable() && !isShowingFullScreenAd) {
                        presentAppOpenAd(activity, call);
                    } else {
                        resolveShown(call, false);
                    }
                };

                pendingAppOpenCancel = () -> {
                    if (!handled.compareAndSet(false, true)) return;
                    clearPendingAppOpenWaiter();
                    resolveShown(call, false);
                };

                pendingAppOpenTimeout = pendingAppOpenCancel;

                mainHandler.postDelayed(pendingAppOpenTimeout, waitMs);
                return;
            }

            resolveShown(call, false);
        });
    }

    @PluginMethod
    public void cancelPendingAppOpen(PluginCall call) {
        mainHandler.post(() -> {
            if (pendingAppOpenCancel != null) {
                Runnable cancel = pendingAppOpenCancel;
                clearPendingAppOpenWaiter();
                cancel.run();
            }
            call.resolve();
        });
    }

    private void presentAppOpenAd(Activity activity, PluginCall call) {
        final AppOpenAd adToShow = appOpenAd;
        if (adToShow == null) {
            resolveShown(call, false);
            return;
        }

        appOpenAd = null;
        isShowingFullScreenAd = true;
        final AtomicBoolean resolved = new AtomicBoolean(false);

        adToShow.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                isShowingFullScreenAd = false;
                if (resolved.compareAndSet(false, true)) {
                    resolveShown(call, true);
                }
            }

            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError adError) {
                Log.d(TAG, "App Open failed to show: " + adError.getMessage());
                isShowingFullScreenAd = false;
                if (resolved.compareAndSet(false, true)) {
                    resolveShown(call, false);
                }
            }
        });

        try {
            adToShow.show(activity);
        } catch (Exception ex) {
            Log.w(TAG, "App Open show exception: " + ex.getMessage());
            isShowingFullScreenAd = false;
            if (resolved.compareAndSet(false, true)) {
                resolveShown(call, false);
            }
        }
    }

    private boolean isAppOpenAdAvailable() {
        return appOpenAd != null && (new Date().getTime() - appOpenLoadTimeMs) < APP_OPEN_FRESHNESS_MS;
    }

    private void notifyPendingAppOpenWaiter() {
        if (pendingAppOpenCallback != null) {
            Runnable callback = pendingAppOpenCallback;
            clearPendingAppOpenWaiter();
            callback.run();
        }
    }

    private void clearPendingAppOpenWaiter() {
        if (pendingAppOpenTimeout != null) {
            mainHandler.removeCallbacks(pendingAppOpenTimeout);
            pendingAppOpenTimeout = null;
        }
        pendingAppOpenCallback = null;
        pendingAppOpenCancel = null;
    }

    private void resolveShown(PluginCall call, boolean shown) {
        JSObject result = new JSObject();
        result.put("shown", shown);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        clearPendingAppOpenWaiter();
        interstitialAd = null;
        appOpenAd = null;
        super.handleOnDestroy();
    }
}
