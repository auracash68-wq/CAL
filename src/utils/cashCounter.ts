import { sanitizePrecision } from './indianFormat';

export const INDIAN_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export type Denomination = (typeof INDIAN_DENOMINATIONS)[number];

export type CashCounts = Record<Denomination, number>;

export interface CashRowSummary {
  denomination: Denomination;
  count: number;
  subtotal: number;
}

export interface CashCounterSummary {
  rows: CashRowSummary[];
  totalNotes: number;
  totalAmount: number;
}

export function createEmptyCashCounts(): CashCounts {
  return {
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0,
  };
}

export function calculateCashSummary(counts: CashCounts): CashCounterSummary {
  let totalNotes = 0;
  let totalAmount = 0;

  const rows: CashRowSummary[] = INDIAN_DENOMINATIONS.map((denomination) => {
    const rawCount = counts[denomination] ?? 0;
    const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;
    const subtotal = denomination * count;
    totalNotes += count;
    totalAmount += subtotal;
    return { denomination, count, subtotal };
  });

  return {
    rows,
    totalNotes,
    totalAmount,
  };
}

export const INDIAN_GST_SLABS = [3, 5, 12, 18, 28] as const;

export interface DetailedGstResult {
  mode: 'exclusive' | 'inclusive';
  supplyType: 'intrastate' | 'interstate';
  rate: number;
  baseAmount: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

export function calculateGstBreakdown(
  amount: number,
  rate: number,
  mode: 'exclusive' | 'inclusive',
  supplyType: 'intrastate' | 'interstate' = 'intrastate'
): DetailedGstResult {
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  const safeRate = Number.isFinite(rate) && rate >= 0 ? rate : 0;

  let baseAmount: number;
  let gstAmount: number;
  let totalAmount: number;

  if (mode === 'exclusive') {
    baseAmount = sanitizePrecision(safeAmount);
    gstAmount = sanitizePrecision((baseAmount * safeRate) / 100);
    totalAmount = sanitizePrecision(baseAmount + gstAmount);
  } else {
    totalAmount = sanitizePrecision(safeAmount);
    baseAmount = sanitizePrecision((totalAmount * 100) / (100 + safeRate));
    gstAmount = sanitizePrecision(totalAmount - baseAmount);
  }

  const cgst = supplyType === 'intrastate' ? sanitizePrecision(gstAmount / 2) : 0;
  const sgst = supplyType === 'intrastate' ? sanitizePrecision(gstAmount / 2) : 0;
  const igst = supplyType === 'interstate' ? gstAmount : 0;

  return {
    mode,
    supplyType,
    rate: safeRate,
    baseAmount,
    gstAmount,
    cgst,
    sgst,
    igst,
    totalAmount,
  };
}
