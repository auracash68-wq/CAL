import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { CalculatorDisplay } from './components/CalculatorDisplay';
import { CalculatorKeypad } from './components/CalculatorKeypad';
import { CashCounterPanel } from './components/CashCounterPanel';
import { GstPanel } from './components/GstPanel';
import { HistoryTapePanel } from './components/HistoryTapePanel';
import { MobileBottomNav } from './components/MobileBottomNav';
import {
  TopBar,
  type DesktopSideTab,
  type WorkspaceTab,
} from './components/TopBar';
import {
  exitAndroidApp,
  hideAndroidSplash,
  registerAndroidBackButton,
  registerAndroidLifecycle,
  registerNetworkMonitor,
  syncAndroidStatusBar,
  triggerAndroidHaptic,
} from './utils/androidBridge';
import { resolveAndroidBackAction } from './utils/androidNavigation';
import {
  calculatorReducer,
  createInitialCalculatorState,
  type CalculatorAction,
  type HistoryEntry,
} from './utils/calculatorEngine';
import type { NumberSystem } from './utils/indianFormat';
import { playKeyClick } from './utils/sound';

const STORAGE_HISTORY_KEY = 'ganaka_calc_history_v1';
const STORAGE_PREFS_KEY = 'ganaka_calc_prefs_v1';

interface StoredPrefs {
  numberSystem: NumberSystem;
  soundEnabled: boolean;
  isDark: boolean;
}

function loadStoredHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadStoredPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
      return {
        numberSystem: parsed.numberSystem === 'INTL' ? 'INTL' : 'IN',
        soundEnabled: Boolean(parsed.soundEnabled),
        isDark: Boolean(parsed.isDark),
      };
    }
  } catch {
    // Fallback to clean light Indian ledger theme
  }
  return { numberSystem: 'IN', soundEnabled: false, isDark: false };
}

export default function App() {
  const [prefs, setPrefs] = useState<StoredPrefs>(loadStoredPrefs);
  const [state, dispatch] = useReducer(
    calculatorReducer,
    undefined,
    () => createInitialCalculatorState(loadStoredHistory())
  );

  const [activeMobileTab, setActiveMobileTab] = useState<WorkspaceTab>('calculator');
  const [activeSideTab, setActiveSideTab] = useState<DesktopSideTab>('ledger');
  const [exitToastVisible, setExitToastVisible] = useState(false);

  const lastBackPressRef = useRef<number>(0);
  const exitToastTimerRef = useRef<number | null>(null);
  const navStateRef = useRef({
    activeTab: activeMobileTab,
    correctMode: state.correctMode,
    isCheckingStep: state.checkIndex !== null,
    isReplaying: state.isReplaying,
  });

  useEffect(() => {
    navStateRef.current = {
      activeTab: activeMobileTab,
      correctMode: state.correctMode,
      isCheckingStep: state.checkIndex !== null,
      isReplaying: state.isReplaying,
    };
  }, [activeMobileTab, state.correctMode, state.checkIndex, state.isReplaying]);

  // Hide native Android splash screen once hydrated
  useEffect(() => {
    void hideAndroidSplash();
  }, []);

  // Sync Tailwind dark class on <html> and native Android StatusBar
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    void syncAndroidStatusBar(prefs.isDark);
    try {
      localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage quota errors
    }
  }, [prefs]);

  // Register Android hardware Back button, App lifecycle, and Network monitor
  useEffect(() => {
    let cleanupBack: (() => void) | null = null;
    let cleanupLifecycle: (() => void) | null = null;
    let cleanupNetwork: (() => void) | null = null;
    let disposed = false;

    void registerAndroidBackButton(() => {
      const current = navStateRef.current;
      const decision = resolveAndroidBackAction({
        activeTab: current.activeTab,
        correctMode: current.correctMode,
        isCheckingStep: current.isCheckingStep,
        isReplaying: current.isReplaying,
        lastBackPressAt: lastBackPressRef.current,
        now: Date.now(),
      });

      switch (decision.action) {
        case 'stop-replay':
          dispatch({ type: 'STOP_REPLAY' });
          break;
        case 'exit-correct-mode':
        case 'exit-check-mode':
          dispatch({ type: 'EXIT_CHECK_MODE' });
          break;
        case 'navigate-calculator':
          setActiveMobileTab('calculator');
          break;
        case 'prompt-exit':
          lastBackPressRef.current = decision.nextLastBackPressAt;
          setExitToastVisible(true);
          if (exitToastTimerRef.current !== null) {
            window.clearTimeout(exitToastTimerRef.current);
          }
          exitToastTimerRef.current = window.setTimeout(() => {
            setExitToastVisible(false);
          }, 2000);
          break;
        case 'exit-app':
          void exitAndroidApp();
          break;
      }
    }).then((unsub) => {
      if (disposed) unsub?.();
      else cleanupBack = unsub;
    });

    void registerAndroidLifecycle({
      onPause: () => {
        dispatch({ type: 'STOP_REPLAY' });
      },
    }).then((unsub) => {
      if (disposed) unsub?.();
      else cleanupLifecycle = unsub;
    });

    void registerNetworkMonitor(() => {
      // Ganaka operates 100% locally offline; listener ensures clean lifecycle awareness without blocking UI
    }).then((unsub) => {
      if (disposed) unsub?.();
      else cleanupNetwork = unsub;
    });

    return () => {
      disposed = true;
      cleanupBack?.();
      cleanupLifecycle?.();
      cleanupNetwork?.();
      if (exitToastTimerRef.current !== null) {
        window.clearTimeout(exitToastTimerRef.current);
      }
    };
  }, []);

  // Persist calculation ledger
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(state.history));
    } catch {
      // Ignore storage quota errors
    }
  }, [state.history]);

  // Auto Replay interval timer (authentic Indian desk calculator step-by-step replay)
  useEffect(() => {
    if (!state.isReplaying) return;
    const timer = window.setInterval(() => {
      dispatch({ type: 'REPLAY_TICK' });
    }, 950);
    return () => window.clearInterval(timer);
  }, [state.isReplaying]);

  const handleAction = useCallback(
    (action: CalculatorAction, soundVariant: 'digit' | 'action' | 'equals' = 'digit') => {
      if (prefs.soundEnabled) {
        playKeyClick(soundVariant);
      }
      void triggerAndroidHaptic(soundVariant);
      dispatch(action);
    },
    [prefs.soundEnabled]
  );

  // Physical keyboard support (skips when typing inside an <input> in GST or Cash Counter)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const { key } = e;
      if (key >= '0' && key <= '9') {
        e.preventDefault();
        handleAction({ type: 'DIGIT', digit: key }, 'digit');
      } else if (key === '.') {
        e.preventDefault();
        handleAction({ type: 'DECIMAL' }, 'digit');
      } else if (key === '+') {
        e.preventDefault();
        handleAction({ type: 'OPERATOR', operator: '+' }, 'action');
      } else if (key === '-') {
        e.preventDefault();
        handleAction({ type: 'OPERATOR', operator: '-' }, 'action');
      } else if (key === '*') {
        e.preventDefault();
        handleAction({ type: 'OPERATOR', operator: '×' }, 'action');
      } else if (key === '/') {
        e.preventDefault();
        handleAction({ type: 'OPERATOR', operator: '÷' }, 'action');
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        handleAction({ type: 'EQUALS' }, 'equals');
      } else if (key === '%') {
        e.preventDefault();
        handleAction({ type: 'PERCENT' }, 'action');
      } else if (key === 'Backspace') {
        e.preventDefault();
        handleAction({ type: 'BACKSPACE' }, 'action');
      } else if (key === 'Escape' || key === 'Delete') {
        e.preventDefault();
        handleAction({ type: 'ALL_CLEAR' }, 'action');
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        handleAction({ type: 'CHECK_BACK' }, 'action');
      } else if (key === 'ArrowRight') {
        e.preventDefault();
        handleAction({ type: 'CHECK_FORWARD' }, 'action');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleAction]);

  const handleLoadIntoCalculator = (value: number) => {
    handleAction({ type: 'LOAD_VALUE', value }, 'equals');
    setActiveMobileTab('calculator');
  };

  const handleRecallHistory = (entry: HistoryEntry) => {
    handleAction({ type: 'RECALL_HISTORY', entry }, 'action');
    setActiveMobileTab('calculator');
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F5F7FA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      <TopBar
        activeMobileTab={activeMobileTab}
        activeSideTab={activeSideTab}
        onSelectMobileTab={setActiveMobileTab}
        onSelectSideTab={setActiveSideTab}
        isDark={prefs.isDark}
        onToggleTheme={() => setPrefs((p) => ({ ...p, isDark: !p.isDark }))}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-2.5 pt-2 pb-16 sm:px-4 sm:pt-4 sm:pb-20 lg:px-6 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 items-stretch">
          {/* Primary Focal Anchor: Precision Indian Clerk Calculator */}
          <div
            id="calculator"
            className={`lg:col-span-7 ${
              activeMobileTab === 'calculator' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="h-full rounded-2xl sm:rounded-3xl bg-white dark:bg-[#111722] border border-slate-200/90 dark:border-slate-800 p-2.5 sm:p-5 lg:p-6 shadow-xs flex flex-col justify-between gap-2 sm:gap-4">
              <CalculatorDisplay
                state={state}
                numberSystem={prefs.numberSystem}
                onToggleNumberSystem={() =>
                  setPrefs((p) => ({
                    ...p,
                    numberSystem: p.numberSystem === 'IN' ? 'INTL' : 'IN',
                  }))
                }
                soundEnabled={prefs.soundEnabled}
                onToggleSound={() =>
                  setPrefs((p) => ({ ...p, soundEnabled: !p.soundEnabled }))
                }
              />

              <CalculatorKeypad state={state} onAction={handleAction} />

              {/* Quiet single-line clerk shortcut hint on desktop */}
              <p className="hidden lg:block text-[11px] text-slate-400 dark:text-slate-500 text-center pt-1">
                Keyboard ready · Digits, + − × ÷, Enter, Backspace, Esc, and ← → for Check &amp; Correct
              </p>
            </div>
          </div>

          {/* Companion Workspace: Ledger Tape, GST Desk, & ₹ Cash Counter */}
          <aside
            aria-label="Indian clerk tools"
            className={`lg:col-span-5 ${
              activeMobileTab !== 'calculator' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="h-full rounded-2xl sm:rounded-3xl bg-white dark:bg-[#111722] border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 lg:p-6 shadow-xs flex flex-col">
              {/* Desktop Segmented Mode Switcher */}
              <div
                role="tablist"
                aria-label="Clerk utility panels"
                className="hidden lg:grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 mb-5"
              >
                {(
                  [
                    { id: 'ledger', label: 'Tape & Ledger' },
                    { id: 'gst', label: 'GST Desk' },
                    { id: 'cash', label: 'Cash ₹' },
                  ] as const
                ).map((tab) => {
                  const isSelected = activeSideTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      role="tab"
                      type="button"
                      aria-selected={isSelected}
                      onClick={() => setActiveSideTab(tab.id)}
                      className={`min-h-[40px] rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                        isSelected
                          ? 'bg-white dark:bg-[#1E293B] text-[#1E3A8A] dark:text-[#FBBF24] shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Mobile shows the selected bottom tab; Desktop shows the selected side tab */}
              <div className="lg:hidden">
                {activeMobileTab === 'ledger' && (
                  <HistoryTapePanel
                    steps={state.steps}
                    checkIndex={state.checkIndex}
                    history={state.history}
                    numberSystem={prefs.numberSystem}
                    onJumpToStep={(idx) => {
                      handleAction({ type: 'JUMP_TO_STEP', index: idx }, 'action');
                      setActiveMobileTab('calculator');
                    }}
                    onRecallHistory={handleRecallHistory}
                    onDeleteHistory={(id) =>
                      handleAction({ type: 'DELETE_HISTORY', id }, 'action')
                    }
                    onClearHistory={() =>
                      handleAction({ type: 'CLEAR_HISTORY' }, 'action')
                    }
                  />
                )}
                {activeMobileTab === 'gst' && (
                  <GstPanel
                    numberSystem={prefs.numberSystem}
                    onSendToCalculator={handleLoadIntoCalculator}
                  />
                )}
                {activeMobileTab === 'cash' && (
                  <CashCounterPanel
                    numberSystem={prefs.numberSystem}
                    onSendToCalculator={handleLoadIntoCalculator}
                  />
                )}
              </div>

              <div className="hidden lg:block lg:min-h-[540px]">
                {activeSideTab === 'ledger' && (
                  <HistoryTapePanel
                    steps={state.steps}
                    checkIndex={state.checkIndex}
                    history={state.history}
                    numberSystem={prefs.numberSystem}
                    onJumpToStep={(idx) =>
                      handleAction({ type: 'JUMP_TO_STEP', index: idx }, 'action')
                    }
                    onRecallHistory={handleRecallHistory}
                    onDeleteHistory={(id) =>
                      handleAction({ type: 'DELETE_HISTORY', id }, 'action')
                    }
                    onClearHistory={() =>
                      handleAction({ type: 'CLEAR_HISTORY' }, 'action')
                    }
                  />
                )}
                {activeSideTab === 'gst' && (
                  <GstPanel
                    numberSystem={prefs.numberSystem}
                    onSendToCalculator={handleLoadIntoCalculator}
                  />
                )}
                {activeSideTab === 'cash' && (
                  <CashCounterPanel
                    numberSystem={prefs.numberSystem}
                    onSendToCalculator={handleLoadIntoCalculator}
                  />
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {exitToastVisible && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-18 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs font-medium shadow-lg whitespace-nowrap"
        >
          Press back again to exit Ganaka
        </div>
      )}

      <MobileBottomNav
        activeTab={activeMobileTab}
        onSelectTab={setActiveMobileTab}
        historyCount={state.history.length}
      />
    </div>
  );
}
