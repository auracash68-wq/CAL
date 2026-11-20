import { Check, Copy, Volume2, VolumeX } from 'lucide-react';
import { useState } from 'react';
import type { CalculatorState } from '../utils/calculatorEngine';
import {
  formatIndianNumber,
  formatRupees,
  numberToIndianWords,
  type NumberSystem,
} from '../utils/indianFormat';

interface CalculatorDisplayProps {
  state: CalculatorState;
  numberSystem: NumberSystem;
  onToggleNumberSystem: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function CalculatorDisplay({
  state,
  numberSystem,
  onToggleNumberSystem,
  soundEnabled,
  onToggleSound,
}: CalculatorDisplayProps) {
  const [copiedTarget, setCopiedTarget] = useState<'num' | 'words' | null>(null);

  const numericValue = Number(state.display);
  const isError = Boolean(state.error) || state.display === 'Error';
  const formattedDisplay = isError
    ? 'Error'
    : formatIndianNumber(state.display, numberSystem);

  const indianWords = isError
    ? state.error || 'Calculation error'
    : numberToIndianWords(Number.isFinite(numericValue) ? numericValue : 0, true);

  // Determine step/expression preview line
  let statusLine = '';
  if (state.checkIndex !== null && state.steps.length > 0) {
    if (state.checkIndex < state.steps.length) {
      const inspected = state.steps[state.checkIndex];
      const stepNum = String(state.checkIndex + 1).padStart(2, '0');
      const totalSteps = String(state.steps.length).padStart(2, '0');
      const opLabel = inspected.operator ? `${inspected.operator} ` : '';
      statusLine = state.correctMode
        ? `Correcting Step ${stepNum}/${totalSteps} (${opLabel}enter new value & press =)`
        : `Check Step ${stepNum}/${totalSteps} · ${opLabel}${formatIndianNumber(inspected.value, numberSystem)} · Subtotal ${formatIndianNumber(inspected.runningTotal, numberSystem)}`;
    } else {
      statusLine = `Check Complete · Total of ${state.steps.length} steps`;
    }
  } else if (state.pendingOperator && state.accumulator !== null) {
    const opName = state.pendingOperator === 'MU' ? 'MU (Margin %)' : state.pendingOperator;
    statusLine = `${formatIndianNumber(state.accumulator, numberSystem)} ${opName}`;
  } else if (state.justEvaluated && state.steps.length > 0) {
    const preview = state.steps
      .slice(-4)
      .map((s, idx) => {
        const prefix = idx === 0 && state.steps.length <= 4 ? '' : `${s.operator ?? ''} `;
        return `${prefix}${formatIndianNumber(s.value, numberSystem)}`;
      })
      .join(' ');
    statusLine = `${state.steps.length > 4 ? '… ' : ''}${preview} =`;
  } else {
    statusLine = 'Ready';
  }

  // Adaptive numeral scale so large crore amounts never clip on compact 320px-360px Android screens
  const displayLen = formattedDisplay.length;
  const numeralSizeClass =
    displayLen <= 10
      ? 'text-[2rem] sm:text-[2.5rem] lg:text-[2.95rem]'
      : displayLen <= 14
        ? 'text-[1.6rem] sm:text-[2.05rem] lg:text-[2.35rem]'
        : 'text-[1.3rem] sm:text-[1.65rem] lg:text-[1.95rem]';

  const copyText = async (text: string, target: 'num' | 'words') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      window.setTimeout(() => setCopiedTarget(null), 1500);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  return (
    <section
      aria-label="Calculator display"
      className="rounded-2xl border border-slate-200/90 dark:border-slate-700/80 bg-[#EDF2EE] dark:bg-[#14201C] lcd-surface shadow-[inset_0_1px_3px_rgba(15,23,42,0.07)] dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.45)] px-3 py-2.5 sm:px-5 sm:py-4"
    >
      {/* Top quiet instrument toolbar: indicators + number system + sound toggle */}
      <div className="flex items-center justify-between gap-2 pb-1.5 sm:pb-2 border-b border-slate-900/10 dark:border-emerald-100/10">
        <div className="flex items-center gap-2 text-[11px] sm:text-xs font-mono font-medium text-slate-700 dark:text-emerald-200/85 min-w-0 truncate">
          <span
            data-testid="step-counter"
            className="tabular-nums whitespace-nowrap shrink-0"
          >
            Step {String(state.checkIndex !== null ? Math.min(state.checkIndex + 1, state.steps.length) : state.steps.length).padStart(2, '0')}
          </span>
          {state.memory !== 0 && (
            <>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span className="font-semibold text-[#1E3A8A] dark:text-[#F59E0B] whitespace-nowrap shrink-0">
                M {formatIndianNumber(state.memory, numberSystem)}
              </span>
            </>
          )}
          {state.grandTotal !== 0 && (
            <>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span
                data-testid="gt-indicator"
                className="font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap shrink-0"
              >
                GT {formatIndianNumber(state.grandTotal, numberSystem)}
              </span>
            </>
          )}
          {state.correctMode && (
            <>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span className="font-bold text-[#C2410C] dark:text-[#FBBF24] whitespace-nowrap shrink-0">
                Correct Mode
              </span>
            </>
          )}
          {state.isReplaying && (
            <>
              <span aria-hidden="true" className="opacity-40">·</span>
              <span className="font-semibold text-[#1E3A8A] dark:text-emerald-300 whitespace-nowrap shrink-0">
                Replaying
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleNumberSystem}
            aria-label={`Number format ${numberSystem === 'IN' ? 'Indian Lakhs and Crores' : 'International Millions'}, click to switch`}
            className="min-h-[30px] sm:min-h-[34px] px-2 sm:px-2.5 rounded-md text-[11px] font-semibold tracking-tight bg-white/80 hover:bg-white dark:bg-[#1E2E28] dark:hover:bg-[#253932] text-slate-800 dark:text-emerald-100 border border-slate-900/10 dark:border-emerald-200/15 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {numberSystem === 'IN' ? 'IN · Lakhs' : 'INTL · M'}
          </button>

          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Mute key click sound' : 'Enable key click sound'}
            aria-pressed={soundEnabled}
            className="min-h-[30px] min-w-[30px] sm:min-h-[34px] sm:min-w-[34px] rounded-md bg-white/80 hover:bg-white dark:bg-[#1E2E28] dark:hover:bg-[#253932] text-slate-700 dark:text-emerald-100 border border-slate-900/10 dark:border-emerald-200/15 flex items-center justify-center cursor-pointer"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 opacity-65" />
            )}
          </button>
        </div>
      </div>

      {/* Expression / Check Step Preview Line */}
      <div
        data-testid="calc-expression"
        className="mt-1.5 sm:mt-2 min-h-[1.15rem] text-right text-xs sm:text-sm font-mono text-slate-600 dark:text-emerald-200/80 truncate tabular-nums"
        title={statusLine}
      >
        {statusLine}
      </div>

      {/* Primary LCD Numeric Readout */}
      <div className="mt-0.5 sm:mt-1 flex items-center justify-end gap-1.5 sm:gap-2">
        <output
          data-testid="calc-display"
          aria-live="polite"
          className={`block w-full text-right font-mono font-bold tracking-tight tabular-nums leading-[1.12] overflow-x-auto whitespace-nowrap ${numeralSizeClass} ${
            isError
              ? 'text-red-700 dark:text-red-400'
              : 'text-[#0F2419] dark:text-[#ECFDF5]'
          }`}
        >
          {formattedDisplay}
        </output>
        <button
          type="button"
          onClick={() => copyText(formattedDisplay, 'num')}
          aria-label="Copy display value"
          className="min-h-[34px] min-w-[34px] rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-900/5 dark:text-emerald-200/75 dark:hover:text-emerald-100 dark:hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
        >
          {copiedTarget === 'num' ? (
            <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Live Indian Words Readout (Essential for cheques, vouchers, bills) */}
      <div className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-900/10 dark:border-emerald-100/10 flex items-start justify-between gap-2">
        <p
          data-testid="calc-indian-words"
          className="text-xs sm:text-[13px] leading-snug text-slate-700 dark:text-emerald-100/90 font-medium line-clamp-2"
        >
          {indianWords}
        </p>
        {!isError && (
          <button
            type="button"
            onClick={() => copyText(indianWords, 'words')}
            aria-label="Copy amount in Indian words"
            className="text-[11px] font-semibold text-[#1E3A8A] dark:text-[#FBBF24] hover:underline whitespace-nowrap shrink-0 pt-0.5 cursor-pointer"
          >
            {copiedTarget === 'words' ? 'Copied' : 'Copy words'}
          </button>
        )}
      </div>

      {/* Inline Quick GST Summary when a Quick GST key was applied */}
      {state.lastGst && (
        <div
          data-testid="quick-gst-breakdown"
          className="mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-slate-900/10 dark:border-emerald-100/10 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-0.5 text-[11px] sm:text-xs font-mono tabular-nums text-slate-700 dark:text-emerald-100/90"
        >
          <span>
            Base {formatRupees(state.lastGst.baseAmount, numberSystem)}
          </span>
          <span aria-hidden="true" className="opacity-35">·</span>
          <span>
            CGST ({state.lastGst.rate / 2}%) {formatRupees(state.lastGst.cgst, numberSystem)}
          </span>
          <span aria-hidden="true" className="opacity-35">·</span>
          <span>
            SGST ({state.lastGst.rate / 2}%) {formatRupees(state.lastGst.sgst, numberSystem)}
          </span>
          <span aria-hidden="true" className="opacity-35">·</span>
          <span className="font-semibold text-[#1E3A8A] dark:text-[#FBBF24]">
            GST {formatRupees(state.lastGst.gstAmount, numberSystem)}
          </span>
        </div>
      )}
    </section>
  );
}
