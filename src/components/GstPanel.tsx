import { ArrowRight, Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { shareSlipText } from '../utils/androidBridge';
import { calculateGstBreakdown, INDIAN_GST_SLABS } from '../utils/cashCounter';
import {
  formatRupees,
  numberToIndianWords,
  type NumberSystem,
} from '../utils/indianFormat';

interface GstPanelProps {
  numberSystem: NumberSystem;
  onSendToCalculator: (value: number) => void;
}

export function GstPanel({ numberSystem, onSendToCalculator }: GstPanelProps) {
  const [amountInput, setAmountInput] = useState<string>('10000');
  const [rate, setRate] = useState<number>(18);
  const [customRate, setCustomRate] = useState<string>('');
  const [mode, setMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const [supplyType, setSupplyType] = useState<'intrastate' | 'interstate'>('intrastate');
  const [copied, setCopied] = useState(false);

  const parsedAmount = Math.max(0, Number(amountInput) || 0);
  const activeRate = customRate.trim() !== '' ? Math.max(0, Number(customRate) || 0) : rate;
  const breakdown = calculateGstBreakdown(parsedAmount, activeRate, mode, supplyType);

  const buildSlipText = () => {
    const lines = [
      `GST Invoice Breakdown (${activeRate}% ${mode === 'exclusive' ? 'Exclusive' : 'Inclusive'})`,
      `Taxable Value: ${formatRupees(breakdown.baseAmount, numberSystem, true)}`,
      supplyType === 'intrastate'
        ? `CGST (${activeRate / 2}%): ${formatRupees(breakdown.cgst, numberSystem, true)}\nSGST (${activeRate / 2}%): ${formatRupees(breakdown.sgst, numberSystem, true)}`
        : `IGST (${activeRate}%): ${formatRupees(breakdown.igst, numberSystem, true)}`,
      `Total GST: ${formatRupees(breakdown.gstAmount, numberSystem, true)}`,
      `Invoice Total: ${formatRupees(breakdown.totalAmount, numberSystem, true)}`,
      `In Words: ${numberToIndianWords(breakdown.totalAmount, true)}`,
    ];
    return lines.join('\n');
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSlipText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleShareSummary = async () => {
    const res = await shareSlipText('GST Invoice Breakdown — Ganaka', buildSlipText());
    if (res === 'copied') {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-display font-bold text-slate-900 dark:text-slate-100">
          Indian GST Calculator
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Compute CGST, SGST, or IGST across standard Indian tax slabs.
        </p>
      </div>

      {/* Mode segmented switch: Exclusive vs Inclusive */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90">
        <button
          type="button"
          onClick={() => setMode('exclusive')}
          aria-pressed={mode === 'exclusive'}
          className={`min-h-[42px] rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            mode === 'exclusive'
              ? 'bg-white dark:bg-slate-900 text-[#1E3A8A] dark:text-[#F59E0B] shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Add GST (+ Exclusive)
        </button>
        <button
          type="button"
          onClick={() => setMode('inclusive')}
          aria-pressed={mode === 'inclusive'}
          className={`min-h-[42px] rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            mode === 'inclusive'
              ? 'bg-white dark:bg-slate-900 text-[#1E3A8A] dark:text-[#F59E0B] shadow-2xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Remove GST (− Inclusive)
        </button>
      </div>

      {/* Amount Input */}
      <div>
        <label
          htmlFor="gst-amount-input"
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {mode === 'exclusive' ? 'Taxable Amount (₹)' : 'GST-Inclusive Total (₹)'}
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-base font-semibold text-slate-400"
          >
            ₹
          </span>
          <input
            id="gst-amount-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0"
            className="w-full min-h-[46px] pl-8 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F1520] text-slate-900 dark:text-slate-100 font-mono text-base font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] dark:focus:ring-[#F59E0B]"
          />
        </div>
      </div>

      {/* GST Slabs & Custom Rate */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            GST Slab Rate
          </span>
          <label htmlFor="gst-custom-rate" className="text-xs text-slate-500 dark:text-slate-400">
            Custom %
          </label>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {INDIAN_GST_SLABS.map((slab) => {
            const isSelected = customRate.trim() === '' && rate === slab;
            return (
              <button
                key={slab}
                type="button"
                onClick={() => {
                  setRate(slab);
                  setCustomRate('');
                }}
                aria-pressed={isSelected}
                className={`min-h-[42px] rounded-lg text-xs font-mono font-semibold tabular-nums border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#1E3A8A] dark:bg-[#D97706] text-white border-transparent'
                    : 'bg-white dark:bg-[#151D2B] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {slab}%
              </button>
            );
          })}
          <input
            id="gst-custom-rate"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            value={customRate}
            onChange={(e) => setCustomRate(e.target.value)}
            placeholder="%"
            aria-label="Custom GST rate percent"
            className="min-h-[42px] px-2 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F1520] text-xs font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] dark:focus:ring-[#F59E0B]"
          />
        </div>
      </div>

      {/* Supply Type (Intrastate vs Interstate) */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Supply Type
        </span>
        <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setSupplyType('intrastate')}
            aria-pressed={supplyType === 'intrastate'}
            className={`min-h-[34px] px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              supplyType === 'intrastate'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            CGST + SGST
          </button>
          <button
            type="button"
            onClick={() => setSupplyType('interstate')}
            aria-pressed={supplyType === 'interstate'}
            className={`min-h-[34px] px-2.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              supplyType === 'interstate'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            IGST
          </button>
        </div>
      </div>

      {/* Breakdown Table */}
      <div
        data-testid="gst-breakdown-summary"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0F1520] divide-y divide-slate-200/80 dark:divide-slate-800"
      >
        <div className="px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-400">Taxable Base Value</span>
          <span
            data-testid="gst-base-value"
            className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100"
          >
            {formatRupees(breakdown.baseAmount, numberSystem, true)}
          </span>
        </div>

        {supplyType === 'intrastate' ? (
          <>
            <div className="px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">
                CGST ({activeRate / 2}%)
              </span>
              <span className="font-mono font-medium tabular-nums text-slate-800 dark:text-slate-200">
                {formatRupees(breakdown.cgst, numberSystem, true)}
              </span>
            </div>
            <div className="px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">
                SGST ({activeRate / 2}%)
              </span>
              <span className="font-mono font-medium tabular-nums text-slate-800 dark:text-slate-200">
                {formatRupees(breakdown.sgst, numberSystem, true)}
              </span>
            </div>
          </>
        ) : (
          <div className="px-4 py-2.5 flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">
              IGST ({activeRate}%)
            </span>
            <span className="font-mono font-medium tabular-nums text-slate-800 dark:text-slate-200">
              {formatRupees(breakdown.igst, numberSystem, true)}
            </span>
          </div>
        )}

        <div className="px-4 py-2.5 flex items-center justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-400">Total GST ({activeRate}%)</span>
          <span
            data-testid="gst-tax-value"
            className="font-mono font-semibold tabular-nums text-[#1E3A8A] dark:text-[#F59E0B]"
          >
            {formatRupees(breakdown.gstAmount, numberSystem, true)}
          </span>
        </div>

        <div className="px-4 py-3 bg-[#EDF2EE]/70 dark:bg-[#14201C] rounded-b-xl">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-emerald-200">
              Invoice Total
            </span>
            <span
              data-testid="gst-total-value"
              className="text-lg font-mono font-bold tabular-nums text-[#0F2419] dark:text-emerald-50"
            >
              {formatRupees(breakdown.totalAmount, numberSystem, true)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-emerald-200/80 leading-snug">
            {numberToIndianWords(breakdown.totalAmount, true)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={handleCopySummary}
          className="min-h-[44px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-[#171F2E] dark:hover:bg-[#1E283A] text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>

        <button
          type="button"
          onClick={handleShareSummary}
          aria-label="Share GST slip"
          className="min-h-[44px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-50 dark:bg-[#171F2E] dark:hover:bg-[#1E283A] text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Share2 className="w-4 h-4 shrink-0" />
          <span>Share</span>
        </button>

        <button
          type="button"
          onClick={() =>
            onSendToCalculator(
              mode === 'exclusive' ? breakdown.totalAmount : breakdown.baseAmount
            )
          }
          className="min-h-[44px] px-2.5 rounded-xl bg-[#1E3A8A] hover:bg-[#172E6E] dark:bg-[#D97706] dark:hover:bg-[#B45309] text-white text-xs font-semibold flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
        >
          <span>Use in Calc</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>
    </div>
  );
}
