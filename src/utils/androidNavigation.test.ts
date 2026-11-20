import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAndroidBackAction } from './androidNavigation';

test('Android back button stops active auto-replay before leaving screen', () => {
  const decision = resolveAndroidBackAction({
    activeTab: 'calculator',
    correctMode: false,
    isCheckingStep: true,
    isReplaying: true,
    lastBackPressAt: 0,
    now: 5000,
  });
  assert.deepEqual(decision, { action: 'stop-replay' });
});

test('Android back button unwinds Correct mode and Check mode cleanly', () => {
  const exitCorrect = resolveAndroidBackAction({
    activeTab: 'calculator',
    correctMode: true,
    isCheckingStep: true,
    isReplaying: false,
    lastBackPressAt: 0,
    now: 5000,
  });
  assert.deepEqual(exitCorrect, { action: 'exit-correct-mode' });

  const exitCheck = resolveAndroidBackAction({
    activeTab: 'calculator',
    correctMode: false,
    isCheckingStep: true,
    isReplaying: false,
    lastBackPressAt: 0,
    now: 5000,
  });
  assert.deepEqual(exitCheck, { action: 'exit-check-mode' });
});

test('Android back button navigates from sub-tabs back to Calculator', () => {
  for (const tab of ['gst', 'cash', 'ledger'] as const) {
    const decision = resolveAndroidBackAction({
      activeTab: tab,
      correctMode: false,
      isCheckingStep: false,
      isReplaying: false,
      lastBackPressAt: 0,
      now: 5000,
    });
    assert.deepEqual(decision, { action: 'navigate-calculator' });
  }
});

test('Android back button requires double-press within 2 seconds to exit on Calculator', () => {
  const firstPress = resolveAndroidBackAction({
    activeTab: 'calculator',
    correctMode: false,
    isCheckingStep: false,
    isReplaying: false,
    lastBackPressAt: 0,
    now: 10000,
  });
  assert.deepEqual(firstPress, { action: 'prompt-exit', nextLastBackPressAt: 10000 });

  const secondPressQuick = resolveAndroidBackAction({
    activeTab: 'calculator',
    correctMode: false,
    isCheckingStep: false,
    isReplaying: false,
    lastBackPressAt: 10000,
    now: 11200,
  });
  assert.deepEqual(secondPressQuick, { action: 'exit-app' });

  const secondPressLate = resolveAndroidBackAction({
    activeTab: 'calculator',
    correctMode: false,
    isCheckingStep: false,
    isReplaying: false,
    lastBackPressAt: 10000,
    now: 13000,
  });
  assert.deepEqual(secondPressLate, { action: 'prompt-exit', nextLastBackPressAt: 13000 });
});
