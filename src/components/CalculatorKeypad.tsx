import {
  ChevronLeft,
  ChevronRight,
  Delete,
  Play,
  Square,
} from 'lucide-react';
import { useState } from 'react';
import type { CalculatorAction, CalculatorState } from '../utils/calculatorEngine';
import { INDIAN_GST_SLABS } from '../utils/cashCounter';

interface CalculatorKeypadProps {
  state: CalculatorState;
  onAction: (action: CalculatorAction, soundVariant?: 'digit' | 'action' | 'equals') => void;
}

export function CalculatorKeypad({ state, onAction }: CalculatorKeypadProps) {
  const [gstMode, setGstMode] = useState<'add' | 'remove'>('add');

  const keyBase =
    'calc-key rounded-xl font-medium flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] dark:focus-visible:ring-[#F59E0B] select-none';

  const digitKey = `${keyBase} min-h-[50px] sm:min-h-[56px] lg:min-h-[60px] text-lg sm:text-xl font-mono font-semibold tabular-nums bg-white hover:bg-slate-50 dark:bg-[#1A2231] dark:hover:bg-[#222C3E] text-slate-900 dark:text-slate-100 border border-slate-200/90 dark:border-slate-700/80 shadow-[0_1px_0_rgba(15,23,42,0.06)] dark:shadow-[0_1px_0_rgba(0,0,0,0.4)]`;

  const operatorKey = `${keyBase} min-h-[50px] sm:min-h-[56px] lg:min-h-[60px] text-lg sm:text-xl font-mono font-semibold bg-[#EEF2FA] hover:bg-[#E1E8F7] dark:bg-[#1E2A40] dark:hover:bg-[#273652] text-[#1E3A8A] dark:text-[#93C5FD] border border-[#1E3A8A]/15 dark:border-[#60A5FA]/20`;

  const utilityKey = `${keyBase} min-h-[44px] sm:min-h-[46px] text-xs sm:text-[13px] font-semibold bg-slate-100 hover:bg-slate-200/80 dark:bg-[#151C28] dark:hover:bg-[#1E2738] text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 whitespace-nowrap`;

  const clerkKey = `${keyBase} min-h-[44px] text-[11px] sm:text-xs font-semibold bg-slate-100/90 hover:bg-slate-200/80 dark:bg-[#141B27] dark:hover:bg-[#1D2637] text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-800 whitespace-nowrap`;

  return (
    <div className="flex flex-col gap-2 sm:gap-2.5">
      {/* Quick Indian GST Slab Bar */}
      <div
        aria-label="Quick Indian GST slabs"
        className="flex items-center gap-1.5"
      >
        <div
          role="group"
          aria-label="GST direction"
          className="flex items-center p-0.5 rounded-lg bg-slate-200/75 dark:bg-slate-800/90 shrink-0"
        >
          <button
            type="button"
            onClick={() => setGstMode('add')}
            aria-pressed={gstMode === 'add'}
            className={`min-h-[36px] px-2 sm:px-2.5 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              gstMode === 'add'
                ? 'bg-white dark:bg-slate-900 text-[#1E3A8A] dark:text-[#F59E0B] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            +GST
          </button>
          <button
            type="button"
            onClick={() => setGstMode('remove')}
            aria-pressed={gstMode === 'remove'}
            className={`min-h-[36px] px-2 sm:px-2.5 rounded-md text-[11px] sm:text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              gstMode === 'remove'
                ? 'bg-white dark:bg-slate-900 text-[#1E3A8A] dark:text-[#F59E0B] shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            −GST
          </button>
        </div>

        <div className="grid grid-cols-5 gap-1 sm:gap-1.5 flex-1">
          {INDIAN_GST_SLABS.map((slab) => (
            <button
              key={slab}
              type="button"
              onClick={() => onAction({ type: 'APPLY_GST', rate: slab, mode: gstMode }, 'action')}
              aria-label={`${gstMode === 'add' ? 'Add' : 'Remove'} ${slab} percent GST`}
              className="calc-key min-h-[38px] rounded-lg text-xs font-mono font-semibold tabular-nums bg-white hover:bg-[#EEF2FA] dark:bg-[#171F2E] dark:hover:bg-[#1F2B40] text-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700/80 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] dark:focus-visible:ring-[#F59E0B]"
            >
              {gstMode === 'add' ? '+' : '−'}
              {slab}%
            </button>
          ))}
        </div>
      </div>

      {/* Row 1: Authentic Indian Clerk Check & Correct Controls */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => onAction({ type: 'CHECK_BACK' }, 'action')}
          aria-label="Check previous step"
          disabled={state.steps.length === 0}
          className={`${clerkKey} gap-0.5 disabled:opacity-45 disabled:cursor-not-allowed`}
        >
          <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
          <span>CHK</span>
        </button>

        <button
          type="button"
          onClick={() => onAction({ type: 'CHECK_FORWARD' }, 'action')}
          aria-label="Check next step"
          disabled={state.steps.length === 0}
          className={`${clerkKey} gap-0.5 disabled:opacity-45 disabled:cursor-not-allowed`}
        >
          <span>CHK</span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onAction({ type: 'TOGGLE_CORRECT' }, 'action')}
          aria-label={state.correctMode ? 'Confirm step correction' : 'Correct inspected step'}
          aria-pressed={state.correctMode}
          disabled={state.steps.length === 0}
          className={`${clerkKey} disabled:opacity-45 disabled:cursor-not-allowed ${
            state.correctMode
              ? '!bg-[#C2410C] !text-white !border-[#C2410C] dark:!bg-[#D97706] dark:!border-[#D97706]'
              : ''
          }`}
        >
          {state.correctMode ? 'SAVE' : 'CORR'}
        </button>

        <button
          type="button"
          onClick={() =>
            onAction(
              state.isReplaying ? { type: 'STOP_REPLAY' } : { type: 'START_REPLAY' },
              'action'
            )
          }
          aria-label={state.isReplaying ? 'Stop auto replay' : 'Auto replay steps'}
          disabled={state.steps.length === 0}
          className={`${clerkKey} gap-1 disabled:opacity-45 disabled:cursor-not-allowed`}
        >
          {state.isReplaying ? (
            <Square className="w-3 h-3 shrink-0" />
          ) : (
            <Play className="w-3 h-3 shrink-0" />
          )}
          <span className="hidden xs:inline sm:inline">REPLAY</span>
          <span className="xs:hidden sm:hidden">PLAY</span>
        </button>

        <button
          type="button"
          onClick={() => onAction({ type: 'GRAND_TOTAL' }, 'action')}
          aria-label="Grand Total recall or clear"
          className={`${clerkKey} ${
            state.grandTotal !== 0
              ? 'text-emerald-800 dark:text-emerald-300 border-emerald-700/25 dark:border-emerald-400/25'
              : ''
          }`}
        >
          GT
        </button>
      </div>

      {/* Row 2: Memory & Business Clerk Keys (MRC, M-, M+, MU, √) */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => onAction({ type: 'MEMORY_RECALL_CLEAR' }, 'action')}
          aria-label="Memory recall or clear"
          className={`${utilityKey} ${
            state.memory !== 0 ? 'text-[#1E3A8A] dark:text-[#F59E0B]' : ''
          }`}
        >
          MRC
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'MEMORY_SUB' }, 'action')}
          aria-label="Memory subtract"
          className={utilityKey}
        >
          M−
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'MEMORY_ADD' }, 'action')}
          aria-label="Memory add"
          className={utilityKey}
        >
          M+
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'OPERATOR', operator: 'MU' }, 'action')}
          aria-label="Mark-Up margin calculator"
          className={`${utilityKey} ${
            state.pendingOperator === 'MU'
              ? '!bg-[#1E3A8A] !text-white dark:!bg-[#D97706]'
              : ''
          }`}
        >
          MU
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'SQRT' }, 'action')}
          aria-label="Square root"
          className={`${utilityKey} font-mono text-base`}
        >
          √
        </button>
      </div>

      {/* Main 4-Column Tactile Keypad */}
      <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
        {/* Row A: AC, Backspace/CE, %, ÷ */}
        <button
          type="button"
          onClick={() => onAction({ type: 'ALL_CLEAR' }, 'action')}
          aria-label="All Clear"
          className={`${keyBase} min-h-[50px] sm:min-h-[56px] lg:min-h-[60px] text-base sm:text-lg font-display font-bold bg-[#FEF2F2] hover:bg-[#FEE2E2] dark:bg-[#3A171C] dark:hover:bg-[#4B1D24] text-[#B91C1C] dark:text-[#FCA5A5] border border-[#DC2626]/20`}
        >
          AC
        </button>

        <button
          type="button"
          onClick={() => onAction({ type: 'BACKSPACE' }, 'action')}
          aria-label="Backspace"
          className={`${keyBase} min-h-[50px] sm:min-h-[56px] lg:min-h-[60px] bg-slate-100 hover:bg-slate-200/80 dark:bg-[#171F2E] dark:hover:bg-[#202B3F] text-slate-800 dark:text-slate-200 border border-slate-200/90 dark:border-slate-700/80`}
        >
          <Delete className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => onAction({ type: 'PERCENT' }, 'action')}
          aria-label="Percent"
          className={operatorKey}
        >
          %
        </button>

        <button
          type="button"
          onClick={() => onAction({ type: 'OPERATOR', operator: '÷' }, 'action')}
          aria-label="Divide"
          className={`${operatorKey} ${
            state.pendingOperator === '÷' && state.waitingForOperand
              ? 'ring-2 ring-[#1E3A8A] dark:ring-[#F59E0B]'
              : ''
          }`}
        >
          ÷
        </button>

        {/* Row B: 7 8 9 × */}
        {['7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onAction({ type: 'DIGIT', digit: d }, 'digit')}
            className={digitKey}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onAction({ type: 'OPERATOR', operator: '×' }, 'action')}
          aria-label="Multiply"
          className={`${operatorKey} ${
            state.pendingOperator === '×' && state.waitingForOperand
              ? 'ring-2 ring-[#1E3A8A] dark:ring-[#F59E0B]'
              : ''
          }`}
        >
          ×
        </button>

        {/* Row C: 4 5 6 − */}
        {['4', '5', '6'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onAction({ type: 'DIGIT', digit: d }, 'digit')}
            className={digitKey}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onAction({ type: 'OPERATOR', operator: '-' }, 'action')}
          aria-label="Subtract"
          className={`${operatorKey} ${
            state.pendingOperator === '-' && state.waitingForOperand
              ? 'ring-2 ring-[#1E3A8A] dark:ring-[#F59E0B]'
              : ''
          }`}
        >
          −
        </button>

        {/* Row D: 1 2 3 + */}
        {['1', '2', '3'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onAction({ type: 'DIGIT', digit: d }, 'digit')}
            className={digitKey}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onAction({ type: 'OPERATOR', operator: '+' }, 'action')}
          aria-label="Add"
          className={`${operatorKey} ${
            state.pendingOperator === '+' && state.waitingForOperand
              ? 'ring-2 ring-[#1E3A8A] dark:ring-[#F59E0B]'
              : ''
          }`}
        >
          +
        </button>

        {/* Row E: 0, 00, ., = */}
        <button
          type="button"
          onClick={() => onAction({ type: 'DIGIT', digit: '0' }, 'digit')}
          className={digitKey}
        >
          0
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'DOUBLE_ZERO' }, 'digit')}
          aria-label="Double zero"
          className={digitKey}
        >
          00
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'DECIMAL' }, 'digit')}
          aria-label="Decimal point"
          className={digitKey}
        >
          .
        </button>
        <button
          type="button"
          onClick={() => onAction({ type: 'EQUALS' }, 'equals')}
          aria-label={state.correctMode ? 'Confirm correction' : 'Equals'}
          className={`${keyBase} min-h-[46px] sm:min-h-[56px] lg:min-h-[60px] text-2xl font-mono font-bold bg-[#1E3A8A] hover:bg-[#172E6E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white shadow-sm`}
        >
          =
        </button>
      </div>
    </div>
  );
}
