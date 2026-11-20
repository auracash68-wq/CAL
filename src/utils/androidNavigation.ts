import type { WorkspaceTab } from '../components/TopBar';

export interface BackNavigationContext {
  activeTab: WorkspaceTab;
  correctMode: boolean;
  isCheckingStep: boolean;
  isReplaying: boolean;
  lastBackPressAt: number;
  now: number;
  exitWindowMs?: number;
}

export type BackNavigationDecision =
  | { action: 'stop-replay' }
  | { action: 'exit-correct-mode' }
  | { action: 'exit-check-mode' }
  | { action: 'navigate-calculator' }
  | { action: 'prompt-exit'; nextLastBackPressAt: number }
  | { action: 'exit-app' };

const DEFAULT_EXIT_WINDOW_MS = 2000;

/**
 * Pure Android hardware back-button state resolver.
 * Prevents accidental app exits by unwinding active calculator modes and sub-tabs first,
 * then requiring a second back press within 2 seconds on the root Calculator screen.
 */
export function resolveAndroidBackAction(
  ctx: BackNavigationContext
): BackNavigationDecision {
  if (ctx.isReplaying) {
    return { action: 'stop-replay' };
  }
  if (ctx.correctMode) {
    return { action: 'exit-correct-mode' };
  }
  if (ctx.isCheckingStep) {
    return { action: 'exit-check-mode' };
  }
  if (ctx.activeTab !== 'calculator') {
    return { action: 'navigate-calculator' };
  }

  const windowMs = ctx.exitWindowMs ?? DEFAULT_EXIT_WINDOW_MS;
  if (ctx.lastBackPressAt > 0 && ctx.now - ctx.lastBackPressAt <= windowMs) {
    return { action: 'exit-app' };
  }

  return {
    action: 'prompt-exit',
    nextLastBackPressAt: ctx.now,
  };
}
