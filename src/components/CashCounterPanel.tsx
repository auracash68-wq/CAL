import { ArrowRight, Check, Copy, Minus, Plus, RotateCcw, Share2 } from 'lucide-react';
import { useState } from 'react';
import { shareSlipText } from '../utils/androidBridge';
import {
  calculateCashSummary,
  createEmptyCashCounts,
  type CashCounts,
  type Denomination,
} from '../utils/cashCounter';
import {
  formatIndianNumber,
  formatRupees,
  numberToIndianWords,
  type NumberSystem,
} from '../utils/indianFormat';

interface CashCounterPanelProps {
  numberSystem: NumberSystem;
  onSendToCalculator: (amount: number) => void;
}

export function CashCounterPanel({
  numberSystem,
  onSendToCalculator,
}: CashCounterPanelProps) {
  const [counts, setCounts] = useState<CashCounts>(createEmptyCashCounts);
  const [copied, setCopied] = useState(false);

  const summary = calculateCashSummary(counts);

  const updateCount = (denom: Denomination, nextValue: number) => {
    const safe = Number.isFinite(nextValue) ? Math.max(0, Math.min(99999, Math.floor(nextValue))) : 0;
    setCounts((prev) => ({ ...prev, [denom]: safe }));
  };

  const handleReset = () => {
    setCounts(createEmptyCashCounts());
  };

  const buildCashSlipText = () => {
    const activeRows = summary.rows
      .filter((r) => r.count > 0)
      .map(
        (r) =>
          `₹${r.denomination} × ${r.count} = ${formatRupees(r.subtotal, numberSystem)}`
      );
    const lines = [
      'Cash Tally Slip — Ganaka',
      ...(activeRows.length > 0 ? activeRows : ['No notes entered']),
      `Total Notes/Coins: ${summary.totalNotes}`,
      `Grand Total: ${formatRupees(summary.totalAmount, numberSystem)}`,
      `In Words: ${numberToIndianWords(summary.totalAmount, true)}`,
    ];
    return lines.join('\n');
  };

  const handleCopySlip = async () => {
    try {
      await navigator.clipboard.writeText(buildCashSlipText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleShareSlip = async () => {
    const res = await shareSlipText('Cash Tally Slip — Ganaka', buildCashSlipText());
    if (res === 'copied') {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-display font-bold text-slate-900 dark:text-slate-100">
            Indian Cash Counter
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tally ₹ notes and coins for daily cash register closing.
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          aria-label="Reset all cash counts"
          className="min-h-[38px] px-2.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Live Cash Total Banner */}
      <div
        data-testid="cash-total-banner"
        className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-[#EDF2EE] dark:bg-[#14201C] px-4 py-3"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-emerald-200/80">
            Total Cash · {summary.totalNotes} {summary.totalNotes === 1 ? 'piece' : 'pieces'}
          </span>
          <span
            data-testid="cash-grand-total"
            className="text-xl font-mono font-bold tabular-nums text-[#0F2419] dark:text-emerald-50"
          >
            {formatRupees(summary.totalAmount, numberSystem)}
          </span>
        </div>
        <p
          data-testid="cash-total-words"
          className="mt-1 text-xs text-slate-700 dark:text-emerald-100/85 leading-snug"
        >
          {numberToIndianWords(summary.totalAmount, true)}
        </p>
      </div>

      {/* Denomination Rows */}
      <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border-y border-slate-200/80 dark:border-slate-800">
        {summary.rows.map(({ denomination, count, subtotal }) => (
          <div
            key={denomination}
            className="py-2 flex items-center justify-between gap-2"
          >
            <label
              htmlFor={`denom-${denomination}`}
              className="w-16 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 shrink-0"
            >
              ₹{denomination}
            </label>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateCount(denomination, count - 1)}
                aria-label={`Decrease ₹${denomination} count`}
                className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-[#161E2C] dark:hover:bg-[#1F293B] text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              <input
                id={`denom-${denomination}`}
                type="number"
                inputMode="numeric"
                min="0"
                max="99999"
                aria-label={`Number of ₹${denomination} notes`}
                value={count === 0 ? '' : count}
                placeholder="0"
                onChange={(e) => updateCount(denomination, Number(e.target.value))}
                className="w-16 min-h-[40px] px-2 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1520] font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] dark:focus:ring-[#F59E0B]"
              />

              <button
                type="button"
                onClick={() => updateCount(denomination, count + 1)}
                aria-label={`Increase ₹${denomination} count`}
                className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-[#161E2C] dark:hover:bg-[#1F293B] text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <span className="flex-1 text-right font-mono text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-300 truncate">
              {subtotal > 0 ? `₹${formatIndianNumber(subtotal, numberSystem)}` : '—'}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleCopySlip}
          className="min-h-[44px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-[#171F2E] dark:hover:bg-[#1E283A] text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>

        <button
          type="button"
          onClick={handleShareSlip}
          aria-label="Share cash tally slip"
          className="min-h-[44px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-[#171F2E] dark:hover:bg-[#1E283A] text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Share2 className="w-4 h-4 shrink-0" />
          <span>Share</span>
        </button>

        <button
          type="button"
          onClick={() => onSendToCalculator(summary.totalAmount)}
          disabled={summary.totalAmount === 0}
          className="min-h-[44px] px-2.5 rounded-xl bg-[#1E3A8A] hover:bg-[#172E6E] dark:bg-[#D97706] dark:hover:bg-[#B45309] disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
        >
          <span>Send Calc</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>
    </div>
  );
}
