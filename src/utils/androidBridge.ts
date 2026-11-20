import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function waitForNextFrame(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForFontsOrTimeout(timeoutMs: number): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // Continue seamlessly when offline or Font Loading API is unavailable
  }
}

export async function hideAndroidSplash(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 180 });
  } catch {
    // Splash screen may already be hidden
  }
}

/**
 * Updates StatusBar colors and icon contrast without toggling overlaysWebView,
 * preventing vertical window-inset reflows or screen jumps on theme switches.
 */
export async function syncAndroidStatusBar(isDark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setBackgroundColor({
      color: isDark ? '#111722' : '#FFFFFF',
    });
    // In Capacitor StatusBar: Style.Dark = light icons for dark bg, Style.Light = dark icons for light bg
    await StatusBar.setStyle({
      style: isDark ? Style.Dark : Style.Light,
    });
  } catch {
    // Ignore on platforms where StatusBar is unsupported
  }
}

/**
 * Deterministic cold-start shell initialization:
 * 1. Configures non-overlay StatusBar & theme colors WHILE the splash screen covers the viewport
 * 2. Waits for web fonts (capped at 350ms so offline cold starts stay instant)
 * 3. Waits 2 animation frames so Android WebView finishes settling WindowInsets & layout
 * 4. Smoothly fades out the SplashScreen with zero layout jump or vertical shake
 */
export async function initAndroidShell(isDark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await syncAndroidStatusBar(isDark);
  } catch {
    // Ignore if StatusBar plugin is unavailable
  }
  await waitForFontsOrTimeout(350);
  await waitForNextFrame();
  await waitForNextFrame();
  await hideAndroidSplash();
}

export async function triggerAndroidHaptic(
  variant: 'digit' | 'action' | 'equals' = 'digit'
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.impact({
      style: variant === 'equals' ? ImpactStyle.Medium : ImpactStyle.Light,
    });
  } catch {
    // Ignore if device haptics are disabled
  }
}

export async function exitAndroidApp(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await CapacitorApp.exitApp();
  } catch {
    // Ignore on non-Android environments
  }
}

/**
 * Shares calculation/GST/cash slips via the native Android Share Sheet when running
 * inside Capacitor, falling back cleanly to Web Share API or clipboard on browsers.
 */
export async function shareSlipText(
  title: string,
  text: string
): Promise<'shared' | 'copied' | 'failed'> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title,
        text,
        dialogTitle: title,
      });
      return 'shared';
    } catch {
      // User cancelled share sheet or share unavailable; do not throw
      return 'failed';
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch {
      // Fall through to clipboard
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}

export async function registerAndroidBackButton(
  onBackPressed: () => void
): Promise<(() => void) | null> {
  if (!isNativeAndroid()) return null;
  let handle: PluginListenerHandle | null = null;
  try {
    handle = await CapacitorApp.addListener('backButton', () => {
      onBackPressed();
    });
  } catch {
    return null;
  }
  return () => {
    void handle?.remove();
  };
}

export async function registerAndroidLifecycle(callbacks: {
  onPause?: () => void;
  onResume?: () => void;
}): Promise<(() => void) | null> {
  if (!Capacitor.isNativePlatform()) return null;
  let handle: PluginListenerHandle | null = null;
  try {
    handle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        callbacks.onResume?.();
      } else {
        callbacks.onPause?.();
      }
    });
  } catch {
    return null;
  }
  return () => {
    void handle?.remove();
  };
}

export async function registerNetworkMonitor(
  onChange: (connected: boolean) => void
): Promise<(() => void) | null> {
  if (!Capacitor.isNativePlatform()) {
    if (typeof window === 'undefined') return null;
    const handleOnline = () => onChange(true);
    const handleOffline = () => onChange(false);
    onChange(typeof navigator !== 'undefined' ? navigator.onLine : true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  let handle: PluginListenerHandle | null = null;
  try {
    const current = await Network.getStatus();
    onChange(current.connected);
    handle = await Network.addListener('networkStatusChange', (status) => {
      onChange(status.connected);
    });
  } catch {
    return null;
  }
  return () => {
    void handle?.remove();
  };
}
