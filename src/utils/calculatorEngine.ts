import { sanitizePrecision } from './indianFormat';

export type CalcOperator = '+' | '-' | '×' | '÷' | 'MU';

export interface CalcStep {
  id: number;
  operator: CalcOperator | null;
  value: number;
  runningTotal: number;
}

export interface GstQuickBreakdown {
  mode: 'add' | 'remove';
  rate: number;
  baseAmount: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  totalAmount: number;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  expression: string;
  result: number;
  steps: CalcStep[];
  gstSummary?: GstQuickBreakdown;
}

export interface CalculatorState {
  display: string;
  accumulator: number | null;
  pendingOperator: CalcOperator | null;
  waitingForOperand: boolean;
  justEvaluated: boolean;
  error: string | null;
  /** Step-by-step tape for Check & Correct */
  steps: CalcStep[];
  /** Active index when inspecting steps: null = live mode, 0..steps.length-1 = step index, steps.length = total */
  checkIndex: number | null;
  /** True while editing a step in Check & Correct mode */
  correctMode: boolean;
  /** True while Auto Replay is playing */
  isReplaying: boolean;
  /** Memory register (M+, M-, MRC) */
  memory: number;
  lastKeyWasMrc: boolean;
  /** Grand Total accumulator across '=' evaluations */
  grandTotal: number;
  lastKeyWasGt: boolean;
  /** Last quick GST calculation breakdown for inline LCD summary */
  lastGst: GstQuickBreakdown | null;
  /** Saved calculation ledger */
  history: HistoryEntry[];
}

export type CalculatorAction =
  | { type: 'DIGIT'; digit: string }
  | { type: 'DOUBLE_ZERO' }
  | { type: 'DECIMAL' }
  | { type: 'OPERATOR'; operator: CalcOperator }
  | { type: 'EQUALS' }
  | { type: 'PERCENT' }
  | { type: 'SQRT' }
  | { type: 'TOGGLE_SIGN' }
  | { type: 'BACKSPACE' }
  | { type: 'CLEAR_ENTRY' }
  | { type: 'ALL_CLEAR' }
  | { type: 'MEMORY_ADD' }
  | { type: 'MEMORY_SUB' }
  | { type: 'MEMORY_RECALL_CLEAR' }
  | { type: 'GRAND_TOTAL' }
  | { type: 'CHECK_BACK' }
  | { type: 'CHECK_FORWARD' }
  | { type: 'JUMP_TO_STEP'; index: number }
  | { type: 'TOGGLE_CORRECT' }
  | { type: 'START_REPLAY' }
  | { type: 'REPLAY_TICK' }
  | { type: 'STOP_REPLAY' }
  | { type: 'EXIT_CHECK_MODE' }
  | { type: 'APPLY_GST'; rate: number; mode: 'add' | 'remove' }
  | { type: 'LOAD_VALUE'; value: number }
  | { type: 'RECALL_HISTORY'; entry: HistoryEntry }
  | { type: 'DELETE_HISTORY'; id: string }
  | { type: 'CLEAR_HISTORY' };

const MAX_INPUT_DIGITS = 14;
const MAX_HISTORY_ITEMS = 60;

export function createInitialCalculatorState(
  initialHistory: HistoryEntry[] = []
): CalculatorState {
  return {
    display: '0',
    accumulator: null,
    pendingOperator: null,
    waitingForOperand: false,
    justEvaluated: false,
    error: null,
    steps: [],
    checkIndex: null,
    correctMode: false,
    isReplaying: false,
    memory: 0,
    lastKeyWasMrc: false,
    grandTotal: 0,
    lastKeyWasGt: false,
    lastGst: null,
    history: initialHistory,
  };
}

export function applyBinaryOp(
  left: number,
  operator: CalcOperator,
  right: number
): number | 'Error' {
  let result: number;
  switch (operator) {
    case '+':
      result = left + right;
      break;
    case '-':
      result = left - right;
      break;
    case '×':
      result = left * right;
      break;
    case '÷':
      if (right === 0) return 'Error';
      result = left / right;
      break;
    case 'MU': {
      // Standard Indian clerk / Citizen MU (Mark-Up): Selling Price = Cost / (1 - margin%/100)
      const factor = 1 - right / 100;
      if (Math.abs(factor) < 1e-12) return 'Error';
      result = left / factor;
      break;
    }
  }
  if (!Number.isFinite(result)) return 'Error';
  return sanitizePrecision(result);
}

/**
 * Recomputes all running totals in a step chain after editing any step in Correct mode.
 */
export function recalculateStepChain(steps: CalcStep[]): {
  steps: CalcStep[];
  total: number | 'Error';
} {
  if (steps.length === 0) {
    return { steps: [], total: 0 };
  }

  const updated: CalcStep[] = [];
  let running = sanitizePrecision(steps[0].value);
  updated.push({
    ...steps[0],
    operator: null,
    value: running,
    runningTotal: running,
  });

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    const op = step.operator ?? '+';
    const next = applyBinaryOp(running, op, step.value);
    if (next === 'Error') {
      return { steps: updated, total: 'Error' };
    }
    running = next;
    updated.push({
      ...step,
      operator: op,
      runningTotal: running,
    });
  }

  return { steps: updated, total: running };
}

export function buildExpressionSummary(steps: CalcStep[]): string {
  return steps
    .map((s, idx) => {
      const val = sanitizePrecision(s.value);
      return idx === 0 ? `${val}` : `${s.operator ?? '+'} ${val}`;
    })
    .join(' ');
}

function parseDisplay(display: string): number {
  const n = Number(display);
  return Number.isFinite(n) ? n : 0;
}

function digitCount(str: string): number {
  return str.replace(/[^0-9]/g, '').length;
}

function resetMetaFlags(state: CalculatorState): Partial<CalculatorState> {
  return {
    lastKeyWasMrc: false,
    lastKeyWasGt: false,
    isReplaying: false,
    lastGst: null,
  };
}

export function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction
): CalculatorState {
  // Handle Error state recovery cleanly on input
  if (
    state.error &&
    action.type !== 'ALL_CLEAR' &&
    action.type !== 'CLEAR_ENTRY' &&
    action.type !== 'LOAD_VALUE' &&
    action.type !== 'RECALL_HISTORY' &&
    action.type !== 'DELETE_HISTORY' &&
    action.type !== 'CLEAR_HISTORY'
  ) {
    if (action.type === 'DIGIT' || action.type === 'DECIMAL') {
      const fresh = createInitialCalculatorState(state.history);
      fresh.memory = state.memory;
      fresh.grandTotal = state.grandTotal;
      return calculatorReducer(fresh, action);
    }
    return state;
  }

  switch (action.type) {
    case 'DIGIT': {
      const base = { ...state, ...resetMetaFlags(state) };

      // Editing a step in Check & Correct mode
      if (state.correctMode && state.checkIndex !== null && state.checkIndex < state.steps.length) {
        const current = state.waitingForOperand ? '0' : state.display;
        if (digitCount(current) >= MAX_INPUT_DIGITS) return base;
        const nextDisplay = current === '0' ? action.digit : current + action.digit;
        return {
          ...base,
          display: nextDisplay,
          waitingForOperand: false,
        };
      }

      // Leaving check mode on fresh digit press starts a new calculation
      if (state.checkIndex !== null) {
        return {
          ...base,
          display: action.digit,
          accumulator: null,
          pendingOperator: null,
          waitingForOperand: false,
          justEvaluated: false,
          steps: [],
          checkIndex: null,
          correctMode: false,
        };
      }

      if (state.justEvaluated) {
        return {
          ...base,
          display: action.digit,
          accumulator: null,
          pendingOperator: null,
          waitingForOperand: false,
          justEvaluated: false,
          steps: [],
        };
      }

      if (state.waitingForOperand) {
        return {
          ...base,
          display: action.digit,
          waitingForOperand: false,
        };
      }

      if (digitCount(state.display) >= MAX_INPUT_DIGITS) {
        return base;
      }

      const nextDisplay =
        state.display === '0'
          ? action.digit
          : state.display === '-0'
            ? `-${action.digit}`
            : state.display + action.digit;

      return {
        ...base,
        display: nextDisplay,
      };
    }

    case 'DOUBLE_ZERO': {
      const base = { ...state, ...resetMetaFlags(state) };

      if (state.correctMode && state.checkIndex !== null && state.checkIndex < state.steps.length) {
        const current = state.waitingForOperand ? '0' : state.display;
        if (current === '0' || digitCount(current) + 2 > MAX_INPUT_DIGITS) {
          return { ...base, display: current, waitingForOperand: false };
        }
        return {
          ...base,
          display: current + '00',
          waitingForOperand: false,
        };
      }

      if (state.justEvaluated || state.waitingForOperand || state.checkIndex !== null) {
        return {
          ...base,
          display: '0',
          accumulator: state.justEvaluated || state.checkIndex !== null ? null : state.accumulator,
          pendingOperator:
            state.justEvaluated || state.checkIndex !== null ? null : state.pendingOperator,
          steps: state.justEvaluated || state.checkIndex !== null ? [] : state.steps,
          waitingForOperand: false,
          justEvaluated: false,
          checkIndex: null,
          correctMode: false,
        };
      }

      if (state.display === '0' || state.display === '-0') {
        return base;
      }
      if (digitCount(state.display) + 2 > MAX_INPUT_DIGITS) {
        const remaining = MAX_INPUT_DIGITS - digitCount(state.display);
        if (remaining <= 0) return base;
        return {
          ...base,
          display: state.display + '0'.repeat(remaining),
        };
      }

      return {
        ...base,
        display: state.display + '00',
      };
    }

    case 'DECIMAL': {
      const base = { ...state, ...resetMetaFlags(state) };

      if (state.correctMode && state.checkIndex !== null && state.checkIndex < state.steps.length) {
        if (state.waitingForOperand) {
          return { ...base, display: '0.', waitingForOperand: false };
        }
        if (state.display.includes('.')) return base;
        return { ...base, display: state.display + '.' };
      }

      if (state.justEvaluated || state.checkIndex !== null) {
        return {
          ...base,
          display: '0.',
          accumulator: null,
          pendingOperator: null,
          waitingForOperand: false,
          justEvaluated: false,
          steps: [],
          checkIndex: null,
          correctMode: false,
        };
      }

      if (state.waitingForOperand) {
        return {
          ...base,
          display: '0.',
          waitingForOperand: false,
        };
      }

      if (state.display.includes('.')) {
        return base;
      }

      return {
        ...base,
        display: state.display + '.',
      };
    }

    case 'OPERATOR': {
      const base = {
        ...state,
        ...resetMetaFlags(state),
        checkIndex: null,
        correctMode: false,
      };
      const inputVal = parseDisplay(state.display);

      // Continuing from a completed evaluation: start a fresh chain from the result
      if (state.justEvaluated) {
        const startStep: CalcStep = {
          id: 1,
          operator: null,
          value: inputVal,
          runningTotal: inputVal,
        };
        return {
          ...base,
          accumulator: inputVal,
          pendingOperator: action.operator,
          waitingForOperand: true,
          justEvaluated: false,
          steps: [startStep],
        };
      }

      // Changing pending operator before entering next number
      if (state.waitingForOperand && state.pendingOperator !== null) {
        return {
          ...base,
          pendingOperator: action.operator,
        };
      }

      // First operand in the chain
      if (state.accumulator === null || state.pendingOperator === null) {
        const firstStep: CalcStep = {
          id: 1,
          operator: null,
          value: inputVal,
          runningTotal: inputVal,
        };
        return {
          ...base,
          accumulator: inputVal,
          pendingOperator: action.operator,
          waitingForOperand: true,
          steps: [firstStep],
        };
      }

      // Sequential clerk calculation: evaluate pending operation immediately
      const computed = applyBinaryOp(
        state.accumulator,
        state.pendingOperator,
        inputVal
      );
      if (computed === 'Error') {
        return {
          ...base,
          display: 'Error',
          error: 'Cannot divide by zero',
          accumulator: null,
          pendingOperator: null,
          waitingForOperand: true,
        };
      }

      const nextStep: CalcStep = {
        id: state.steps.length + 1,
        operator: state.pendingOperator,
        value: inputVal,
        runningTotal: computed,
      };

      return {
        ...base,
        display: String(computed),
        accumulator: computed,
        pendingOperator: action.operator,
        waitingForOperand: true,
        steps: [...state.steps, nextStep],
      };
    }

    case 'EQUALS': {
      const base = { ...state, ...resetMetaFlags(state) };

      // Confirming a step edit in Check & Correct mode
      if (state.correctMode && state.checkIndex !== null && state.checkIndex < state.steps.length) {
        return commitStepCorrection(base, state.checkIndex, parseDisplay(state.display));
      }

      // Exiting check mode back to total
      if (state.checkIndex !== null) {
        const finalTotal =
          state.steps.length > 0
            ? state.steps[state.steps.length - 1].runningTotal
            : parseDisplay(state.display);
        return {
          ...base,
          display: String(finalTotal),
          checkIndex: null,
          correctMode: false,
        };
      }

      if (state.pendingOperator === null || state.accumulator === null) {
        return base;
      }

      const rightVal = parseDisplay(state.display);
      const computed = applyBinaryOp(
        state.accumulator,
        state.pendingOperator,
        rightVal
      );

      if (computed === 'Error') {
        return {
          ...base,
          display: 'Error',
          error: 'Cannot divide by zero',
          accumulator: null,
          pendingOperator: null,
          waitingForOperand: true,
        };
      }

      const finalSteps: CalcStep[] = [
        ...state.steps,
        {
          id: state.steps.length + 1,
          operator: state.pendingOperator,
          value: rightVal,
          runningTotal: computed,
        },
      ];

      const historyEntry: HistoryEntry = {
        id: `calc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        expression: buildExpressionSummary(finalSteps),
        result: computed,
        steps: finalSteps,
      };

      return {
        ...base,
        display: String(computed),
        accumulator: computed,
        pendingOperator: null,
        waitingForOperand: true,
        justEvaluated: true,
        steps: finalSteps,
        grandTotal: sanitizePrecision(state.grandTotal + computed),
        history: [historyEntry, ...state.history].slice(0, MAX_HISTORY_ITEMS),
      };
    }

    case 'PERCENT': {
      const base = { ...state, ...resetMetaFlags(state) };
      const currentVal = parseDisplay(state.display);

      if (state.accumulator !== null && state.pendingOperator !== null) {
        let computed: number | 'Error';
        if (state.pendingOperator === '+' || state.pendingOperator === '-') {
          const pctAmount = sanitizePrecision((state.accumulator * currentVal) / 100);
          computed = applyBinaryOp(state.accumulator, state.pendingOperator, pctAmount);
          if (computed === 'Error') return base;
          const finalSteps: CalcStep[] = [
            ...state.steps,
            {
              id: state.steps.length + 1,
              operator: state.pendingOperator,
              value: pctAmount,
              runningTotal: computed,
            },
          ];
          const historyEntry: HistoryEntry = {
            id: `pct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            expression: `${state.accumulator} ${state.pendingOperator} ${currentVal}%`,
            result: computed,
            steps: finalSteps,
          };
          return {
            ...base,
            display: String(computed),
            accumulator: computed,
            pendingOperator: null,
            waitingForOperand: true,
            justEvaluated: true,
            steps: finalSteps,
            grandTotal: sanitizePrecision(state.grandTotal + computed),
            history: [historyEntry, ...state.history].slice(0, MAX_HISTORY_ITEMS),
          };
        } else if (state.pendingOperator === '×') {
          computed = sanitizePrecision((state.accumulator * currentVal) / 100);
          const finalSteps: CalcStep[] = [
            ...state.steps,
            {
              id: state.steps.length + 1,
              operator: '×',
              value: sanitizePrecision(currentVal / 100),
              runningTotal: computed,
            },
          ];
          const historyEntry: HistoryEntry = {
            id: `pct-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            expression: `${state.accumulator} × ${currentVal}%`,
            result: computed,
            steps: finalSteps,
          };
          return {
            ...base,
            display: String(computed),
            accumulator: computed,
            pendingOperator: null,
            waitingForOperand: true,
            justEvaluated: true,
            steps: finalSteps,
            grandTotal: sanitizePrecision(state.grandTotal + computed),
            history: [historyEntry, ...state.history].slice(0, MAX_HISTORY_ITEMS),
          };
        } else if (state.pendingOperator === '÷') {
          if (currentVal === 0) {
            return { ...base, display: 'Error', error: 'Cannot divide by zero' };
          }
          computed = sanitizePrecision((state.accumulator / currentVal) * 100);
          return {
            ...base,
            display: String(computed),
            accumulator: computed,
            pendingOperator: null,
            waitingForOperand: true,
            justEvaluated: true,
            grandTotal: sanitizePrecision(state.grandTotal + computed),
          };
        }
      }

      const pct = sanitizePrecision(currentVal / 100);
      return {
        ...base,
        display: String(pct),
        waitingForOperand: true,
      };
    }

    case 'SQRT': {
      const base = { ...state, ...resetMetaFlags(state) };
      const val = parseDisplay(state.display);
      if (val < 0) {
        return {
          ...base,
          display: 'Error',
          error: 'Invalid square root of negative number',
        };
      }
      const result = sanitizePrecision(Math.sqrt(val));
      return {
        ...base,
        display: String(result),
        waitingForOperand: true,
      };
    }

    case 'TOGGLE_SIGN': {
      const base = { ...state, ...resetMetaFlags(state) };
      if (state.display === '0') return base;
      const nextDisplay = state.display.startsWith('-')
        ? state.display.slice(1)
        : `-${state.display}`;
      return {
        ...base,
        display: nextDisplay,
      };
    }

    case 'BACKSPACE': {
      const base = { ...state, ...resetMetaFlags(state) };
      if (state.waitingForOperand && !state.correctMode) return base;
      if (state.display.length <= 1 || (state.display.length === 2 && state.display.startsWith('-'))) {
        return { ...base, display: '0' };
      }
      return {
        ...base,
        display: state.display.slice(0, -1),
      };
    }

    case 'CLEAR_ENTRY': {
      return {
        ...state,
        ...resetMetaFlags(state),
        display: '0',
        error: null,
        waitingForOperand: false,
      };
    }

    case 'ALL_CLEAR': {
      return {
        ...createInitialCalculatorState(state.history),
        memory: state.memory,
        grandTotal: state.grandTotal,
      };
    }

    case 'MEMORY_ADD': {
      const val = parseDisplay(state.display);
      return {
        ...state,
        ...resetMetaFlags(state),
        memory: sanitizePrecision(state.memory + val),
        waitingForOperand: true,
      };
    }

    case 'MEMORY_SUB': {
      const val = parseDisplay(state.display);
      return {
        ...state,
        ...resetMetaFlags(state),
        memory: sanitizePrecision(state.memory - val),
        waitingForOperand: true,
      };
    }

    case 'MEMORY_RECALL_CLEAR': {
      if (state.lastKeyWasMrc) {
        return {
          ...state,
          memory: 0,
          lastKeyWasMrc: false,
          lastKeyWasGt: false,
        };
      }
      return {
        ...state,
        display: String(state.memory),
        waitingForOperand: true,
        lastKeyWasMrc: true,
        lastKeyWasGt: false,
        checkIndex: null,
        correctMode: false,
      };
    }

    case 'GRAND_TOTAL': {
      if (state.lastKeyWasGt) {
        return {
          ...state,
          grandTotal: 0,
          lastKeyWasGt: false,
          lastKeyWasMrc: false,
        };
      }
      return {
        ...state,
        display: String(state.grandTotal),
        waitingForOperand: true,
        lastKeyWasGt: true,
        lastKeyWasMrc: false,
        checkIndex: null,
        correctMode: false,
      };
    }

    case 'CHECK_BACK': {
      if (state.steps.length === 0) return state;
      const base = { ...state, ...resetMetaFlags(state), correctMode: false };
      let nextIdx: number;
      if (state.checkIndex === null || state.checkIndex >= state.steps.length) {
        nextIdx = state.steps.length - 1;
      } else {
        nextIdx = Math.max(0, state.checkIndex - 1);
      }
      const step = state.steps[nextIdx];
      return {
        ...base,
        checkIndex: nextIdx,
        display: String(step.value),
        waitingForOperand: true,
      };
    }

    case 'CHECK_FORWARD': {
      if (state.steps.length === 0) return state;
      const base = { ...state, ...resetMetaFlags(state), correctMode: false };
      if (state.checkIndex === null) {
        const step = state.steps[0];
        return {
          ...base,
          checkIndex: 0,
          display: String(step.value),
          waitingForOperand: true,
        };
      }
      if (state.checkIndex < state.steps.length - 1) {
        const nextIdx = state.checkIndex + 1;
        return {
          ...base,
          checkIndex: nextIdx,
          display: String(state.steps[nextIdx].value),
          waitingForOperand: true,
        };
      }
      // Show Total at the end of the tape
      const finalTotal = state.steps[state.steps.length - 1].runningTotal;
      return {
        ...base,
        checkIndex: state.steps.length,
        display: String(finalTotal),
        waitingForOperand: true,
      };
    }

    case 'JUMP_TO_STEP': {
      if (action.index < 0 || action.index >= state.steps.length) return state;
      const step = state.steps[action.index];
      return {
        ...state,
        ...resetMetaFlags(state),
        checkIndex: action.index,
        correctMode: false,
        display: String(step.value),
        waitingForOperand: true,
      };
    }

    case 'TOGGLE_CORRECT': {
      if (state.steps.length === 0) return state;
      const base = { ...state, ...resetMetaFlags(state) };

      // If not yet inspecting a step, jump to the last step and enable correct mode
      if (state.checkIndex === null || state.checkIndex >= state.steps.length) {
        const lastIdx = state.steps.length - 1;
        return {
          ...base,
          checkIndex: lastIdx,
          correctMode: true,
          display: String(state.steps[lastIdx].value),
          waitingForOperand: true,
        };
      }

      // If already in correct mode, commit the edited step value
      if (state.correctMode) {
        return commitStepCorrection(base, state.checkIndex, parseDisplay(state.display));
      }

      // Enter correct mode on currently inspected step
      return {
        ...base,
        correctMode: true,
        waitingForOperand: true,
      };
    }

    case 'START_REPLAY': {
      if (state.steps.length === 0) return state;
      return {
        ...state,
        isReplaying: true,
        correctMode: false,
        checkIndex: 0,
        display: String(state.steps[0].value),
        waitingForOperand: true,
      };
    }

    case 'REPLAY_TICK': {
      if (!state.isReplaying || state.steps.length === 0) return state;
      const currentIdx = state.checkIndex ?? 0;
      if (currentIdx < state.steps.length - 1) {
        const nextIdx = currentIdx + 1;
        return {
          ...state,
          checkIndex: nextIdx,
          display: String(state.steps[nextIdx].value),
        };
      }
      if (currentIdx === state.steps.length - 1) {
        const finalTotal = state.steps[state.steps.length - 1].runningTotal;
        return {
          ...state,
          checkIndex: state.steps.length,
          display: String(finalTotal),
        };
      }
      // Finished showing total
      return {
        ...state,
        isReplaying: false,
        checkIndex: null,
      };
    }

    case 'STOP_REPLAY': {
      return {
        ...state,
        isReplaying: false,
      };
    }

    case 'EXIT_CHECK_MODE': {
      const finalTotal =
        state.steps.length > 0
          ? state.steps[state.steps.length - 1].runningTotal
          : parseDisplay(state.display);
      return {
        ...state,
        display: String(finalTotal),
        checkIndex: null,
        correctMode: false,
        isReplaying: false,
        waitingForOperand: true,
      };
    }

    case 'APPLY_GST': {
      const amount = parseDisplay(state.display);
      const rate = action.rate;
      let baseAmount: number;
      let gstAmount: number;
      let totalAmount: number;

      if (action.mode === 'add') {
        baseAmount = sanitizePrecision(amount);
        gstAmount = sanitizePrecision((baseAmount * rate) / 100);
        totalAmount = sanitizePrecision(baseAmount + gstAmount);
      } else {
        totalAmount = sanitizePrecision(amount);
        baseAmount = sanitizePrecision((totalAmount * 100) / (100 + rate));
        gstAmount = sanitizePrecision(totalAmount - baseAmount);
      }

      const cgst = sanitizePrecision(gstAmount / 2);
      const sgst = sanitizePrecision(gstAmount / 2);
      const resultVal = action.mode === 'add' ? totalAmount : baseAmount;

      const gstSummary: GstQuickBreakdown = {
        mode: action.mode,
        rate,
        baseAmount,
        gstAmount,
        cgst,
        sgst,
        totalAmount,
      };

      const step1: CalcStep = {
        id: 1,
        operator: null,
        value: amount,
        runningTotal: amount,
      };
      const step2: CalcStep = {
        id: 2,
        operator: action.mode === 'add' ? '+' : '-',
        value: gstAmount,
        runningTotal: resultVal,
      };

      const historyEntry: HistoryEntry = {
        id: `gst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        expression: `${amount} ${action.mode === 'add' ? '+' : '−'} ${rate}% GST`,
        result: resultVal,
        steps: [step1, step2],
        gstSummary,
      };

      return {
        ...state,
        display: String(resultVal),
        accumulator: resultVal,
        pendingOperator: null,
        waitingForOperand: true,
        justEvaluated: true,
        checkIndex: null,
        correctMode: false,
        isReplaying: false,
        lastKeyWasMrc: false,
        lastKeyWasGt: false,
        lastGst: gstSummary,
        steps: [step1, step2],
        grandTotal: sanitizePrecision(state.grandTotal + resultVal),
        history: [historyEntry, ...state.history].slice(0, MAX_HISTORY_ITEMS),
      };
    }

    case 'LOAD_VALUE': {
      const clean = sanitizePrecision(action.value);
      return {
        ...state,
        ...resetMetaFlags(state),
        display: String(clean),
        accumulator: clean,
        pendingOperator: null,
        waitingForOperand: true,
        justEvaluated: false,
        error: null,
        checkIndex: null,
        correctMode: false,
        steps: [
          {
            id: 1,
            operator: null,
            value: clean,
            runningTotal: clean,
          },
        ],
      };
    }

    case 'RECALL_HISTORY': {
      const clean = sanitizePrecision(action.entry.result);
      return {
        ...state,
        ...resetMetaFlags(state),
        display: String(clean),
        accumulator: clean,
        pendingOperator: null,
        waitingForOperand: true,
        justEvaluated: true,
        error: null,
        checkIndex: null,
        correctMode: false,
        steps: action.entry.steps,
        lastGst: action.entry.gstSummary ?? null,
      };
    }

    case 'DELETE_HISTORY': {
      return {
        ...state,
        history: state.history.filter((h) => h.id !== action.id),
      };
    }

    case 'CLEAR_HISTORY': {
      return {
        ...state,
        history: [],
      };
    }

    default:
      return state;
  }
}

function commitStepCorrection(
  state: CalculatorState,
  stepIndex: number,
  newValue: number
): CalculatorState {
  const modifiedSteps = state.steps.map((step, idx) =>
    idx === stepIndex ? { ...step, value: sanitizePrecision(newValue) } : step
  );

  const recomputed = recalculateStepChain(modifiedSteps);
  if (recomputed.total === 'Error') {
    return {
      ...state,
      display: 'Error',
      error: 'Division by zero in corrected step',
      correctMode: false,
      checkIndex: null,
    };
  }

  const historyEntry: HistoryEntry = {
    id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    expression: `${buildExpressionSummary(recomputed.steps)} (Corrected)`,
    result: recomputed.total,
    steps: recomputed.steps,
  };

  return {
    ...state,
    display: String(recomputed.total),
    accumulator: recomputed.total,
    pendingOperator: null,
    waitingForOperand: true,
    justEvaluated: true,
    steps: recomputed.steps,
    checkIndex: null,
    correctMode: false,
    history: [historyEntry, ...state.history].slice(0, MAX_HISTORY_ITEMS),
  };
}
