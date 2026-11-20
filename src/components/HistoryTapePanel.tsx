import { ArrowUpRight, Check, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { CalcStep, HistoryEntry } from '../utils/calculatorEngine';
import {
  formatIndianNumber,
  numberToIndianWords,
  type NumberSystem,
} from '../utils/indianFormat';

interface HistoryTapePanelProps {
  steps: CalcStep[];
  checkIndex: number | null;
  history: HistoryEntry[];
  numberSystem: NumberSystem;
  onJumpToStep: (index: number) => void;
  onRecallHistory: (entry: HistoryEntry) => void;
  onDeleteHistory: (id: string) => void;
  onClearHistory: () => void;
}

function formatTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

export function HistoryTapePanel({
  steps,
  checkIndex,
  history,
  numberSystem,
  onJumpToStep,
  onRecallHistory,
  onDeleteHistory,
  onClearHistory,
}: HistoryTapePanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (entry: HistoryEntry) => {
    const formatted = formatIndianNumber(entry.result, numberSystem);
    const words = numberToIndianWords(entry.result, true);
    const summary = `${entry.expression} = ${formatted} (${words})`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* Live Current Tape (Interactive Check & Correct Jump List) */}
      <section aria-label="Active calculation tape">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
            Active Step Tape
          </h2>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            {steps.length} {steps.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {steps.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-3 border-y border-slate-200/80 dark:border-slate-800">
            Enter a calculation to record steps. Tap any recorded step to inspect or correct it in place.
          </p>
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-slate-800/90 border-y border-slate-200/80 dark:border-slate-800 max-h-44 overflow-y-auto">
            {steps.map((step, index) => {
              const isSelected = checkIndex === index;
              return (
                <button
                  key={`${step.id}-${index}`}
                  type="button"
                  onClick={() => onJumpToStep(index)}
                  className={`w-full min-h-[42px] px-2.5 py-2 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#EEF2FA] dark:bg-[#1E2A40] text-[#1E3A8A] dark:text-[#F59E0B]'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums shrink-0">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-mono font-semibold tabular-nums truncate">
                      {step.operator ? `${step.operator} ` : ''}
                      {formatIndianNumber(step.value, numberSystem)}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    = {formatIndianNumber(step.runningTotal, numberSystem)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved Calculation Ledger */}
      <section aria-label="Saved calculation ledger" className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
              Saved Ledger
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              · {history.length}
            </span>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="min-h-[34px] px-2 text-xs font-medium text-red-700 dark:text-red-400 hover:underline cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="py-10 text-center border-t border-slate-200/80 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No saved entries yet
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Press = or apply a GST slab to log calculations automatically.
            </p>
          </div>
        ) : (
          <ul
            data-testid="ledger-history-list"
            className="divide-y divide-slate-200/80 dark:divide-slate-800 border-t border-slate-200/80 dark:border-slate-800 overflow-y-auto flex-1 pr-0.5"
          >
            {history.map((entry) => {
              const formattedRes = formatIndianNumber(entry.result, numberSystem);
              const words = numberToIndianWords(entry.result, true);
              return (
                <li
                  key={entry.id}
                  className="py-3 flex items-start justify-between gap-2 group"
                >
                  <button
                    type="button"
                    onClick={() => onRecallHistory(entry)}
                    aria-label={`Recall ${entry.expression} equals ${formattedRes}`}
                    className="flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] dark:focus-visible:ring-[#F59E0B] rounded-md"
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      <span className="truncate">{entry.expression}</span>
                      <span aria-hidden="true" className="opacity-40">·</span>
                      <span className="shrink-0 tabular-nums">{formatTime(entry.timestamp)}</span>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="text-base font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formattedRes}
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#1E3A8A] dark:group-hover:text-[#F59E0B] transition-colors shrink-0" />
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                      {words}
                    </p>
                  </button>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(entry)}
                      aria-label={`Copy entry ${formattedRes}`}
                      className="min-h-[38px] min-w-[38px] rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHistory(entry.id)}
                      aria-label={`Delete entry ${formattedRes}`}
                      className="min-h-[38px] min-w-[38px] rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
