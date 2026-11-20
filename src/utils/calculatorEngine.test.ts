import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIndianNumber,
  formatRupees,
  numberToIndianWords,
} from './indianFormat';
import {
  calculatorReducer,
  createInitialCalculatorState,
  type CalculatorAction,
  type CalculatorState,
} from './calculatorEngine';
import {
  calculateCashSummary,
  calculateGstBreakdown,
  createEmptyCashCounts,
} from './cashCounter';

function runActions(
  actions: CalculatorAction[],
  initial?: CalculatorState
): CalculatorState {
  return actions.reduce(
    (state, action) => calculatorReducer(state, action),
    initial ?? createInitialCalculatorState()
  );
}

function typeNumber(numStr: string): CalculatorAction[] {
  return numStr.split('').map((ch): CalculatorAction => {
    if (ch === '.') return { type: 'DECIMAL' };
    return { type: 'DIGIT', digit: ch };
  });
}

test('Indian number formatting groups Lakhs and Crores accurately', () => {
  assert.equal(formatIndianNumber(1000, 'IN'), '1,000');
  assert.equal(formatIndianNumber(100000, 'IN'), '1,00,000');
  assert.equal(formatIndianNumber(12345678.5, 'IN'), '1,23,45,678.5');
  assert.equal(formatIndianNumber(-125000, 'IN'), '−1,25,000');
  assert.equal(formatIndianNumber('125000.', 'IN'), '1,25,000.');
  assert.equal(formatIndianNumber('125000.00', 'IN'), '1,25,000.00');
  assert.equal(formatIndianNumber(12345678.5, 'INTL'), '12,345,678.5');
  assert.equal(formatRupees(125450.5, 'IN'), '₹1,25,450.50');
});

test('Indian words conversion handles Rupees, Paise, Lakhs, and Crores', () => {
  assert.equal(numberToIndianWords(0, true), 'Zero Rupees');
  assert.equal(numberToIndianWords(1, true), 'One Rupee');
  assert.equal(numberToIndianWords(100000, true), 'One Lakh Rupees');
  assert.equal(
    numberToIndianWords(125450.75, true),
    'One Lakh Twenty-Five Thousand Four Hundred Fifty Rupees and Seventy-Five Paise'
  );
  assert.equal(numberToIndianWords(10000000, true), 'One Crore Rupees');
  assert.equal(
    numberToIndianWords(1250000000, true),
    'One Hundred Twenty-Five Crore Rupees'
  );
  assert.equal(numberToIndianWords(-500, true), 'Minus Five Hundred Rupees');
});

test('Clerk sequential arithmetic, double zero, floating precision, and Grand Total', () => {
  const s1 = runActions([
    ...typeNumber('1250'),
    { type: 'DOUBLE_ZERO' },
    { type: 'OPERATOR', operator: '+' },
    ...typeNumber('25000'),
    { type: 'OPERATOR', operator: '+' },
    ...typeNumber('50000'),
    { type: 'EQUALS' },
  ]);

  assert.equal(s1.display, '200000');
  assert.equal(s1.steps.length, 3);
  assert.equal(s1.grandTotal, 200000);
  assert.equal(s1.history.length, 1);

  // Floating-point cleanliness: 0.1 + 0.2 = 0.3
  const s2 = runActions([
    ...typeNumber('0.1'),
    { type: 'OPERATOR', operator: '+' },
    ...typeNumber('0.2'),
    { type: 'EQUALS' },
  ]);
  assert.equal(s2.display, '0.3');

  // Grand Total accumulates across evaluations and clears on second GT tap
  const s3 = runActions(
    [
      ...typeNumber('50000'),
      { type: 'OPERATOR', operator: '+' },
      ...typeNumber('10000'),
      { type: 'EQUALS' },
      { type: 'GRAND_TOTAL' },
    ],
    s1
  );
  assert.equal(s3.display, '260000');
  const s4 = calculatorReducer(s3, { type: 'GRAND_TOTAL' });
  assert.equal(s4.grandTotal, 0);
});

test('Check & Correct step inspection and live recalculation', () => {
  const s1 = runActions([
    ...typeNumber('125000'),
    { type: 'OPERATOR', operator: '+' },
    ...typeNumber('25000'),
    { type: 'OPERATOR', operator: '+' },
    ...typeNumber('50000'),
    { type: 'EQUALS' },
  ]);
  assert.equal(s1.display, '200000');

  // Press CHECK BACK twice: step index 2 (50000) -> step index 1 (25000)
  const s2 = runActions(
    [{ type: 'CHECK_BACK' }, { type: 'CHECK_BACK' }],
    s1
  );
  assert.equal(s2.checkIndex, 1);
  assert.equal(s2.display, '25000');

  // Enter CORRECT mode, type 75000, confirm with EQUALS
  const s3 = runActions(
    [
      { type: 'TOGGLE_CORRECT' },
      ...typeNumber('75000'),
      { type: 'EQUALS' },
    ],
    s2
  );
  assert.equal(s3.correctMode, false);
  assert.equal(s3.checkIndex, null);
  assert.equal(s3.display, '250000');
  assert.equal(s3.steps[1].value, 75000);
  assert.equal(s3.steps[2].runningTotal, 250000);
});

test('Mark-Up (MU), Percentage, and Quick GST slabs', () => {
  // Cost 1000 with 20% margin => Selling Price 1250
  const muState = runActions([
    ...typeNumber('1000'),
    { type: 'OPERATOR', operator: 'MU' },
    ...typeNumber('20'),
    { type: 'EQUALS' },
  ]);
  assert.equal(muState.display, '1250');

  // 200 + 10% = 220
  const pctState = runActions([
    ...typeNumber('200'),
    { type: 'OPERATOR', operator: '+' },
    ...typeNumber('10'),
    { type: 'PERCENT' },
  ]);
  assert.equal(pctState.display, '220');

  // Quick +18% GST on 10,000 => 11,800 (CGST 900, SGST 900)
  const gstAdd = runActions([
    ...typeNumber('10000'),
    { type: 'APPLY_GST', rate: 18, mode: 'add' },
  ]);
  assert.equal(gstAdd.display, '11800');
  assert.equal(gstAdd.lastGst?.baseAmount, 10000);
  assert.equal(gstAdd.lastGst?.gstAmount, 1800);
  assert.equal(gstAdd.lastGst?.cgst, 900);
  assert.equal(gstAdd.lastGst?.sgst, 900);

  // Quick -18% GST on 11,800 => 10,000
  const gstRemove = calculatorReducer(gstAdd, {
    type: 'APPLY_GST',
    rate: 18,
    mode: 'remove',
  });
  assert.equal(gstRemove.display, '10000');
  assert.equal(gstRemove.lastGst?.gstAmount, 1800);
});

test('Indian Cash Denomination Counter and GST Breakdown helper', () => {
  const counts = createEmptyCashCounts();
  counts[500] = 10;
  counts[200] = 5;
  counts[50] = 2;

  const summary = calculateCashSummary(counts);
  assert.equal(summary.totalNotes, 17);
  assert.equal(summary.totalAmount, 6100);

  const interGst = calculateGstBreakdown(50000, 12, 'exclusive', 'interstate');
  assert.equal(interGst.gstAmount, 6000);
  assert.equal(interGst.igst, 6000);
  assert.equal(interGst.cgst, 0);
  assert.equal(interGst.totalAmount, 56000);
});
