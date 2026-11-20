export type NumberSystem = 'IN' | 'INTL';

/**
 * Removes floating point artifacts like 0.30000000000000004 -> 0.3
 */
export function sanitizePrecision(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (Math.abs(value) < 1e-12) return 0;
  return Number(value.toPrecision(12));
}

/**
 * Formats an integer digit string with Indian (2-2-3) or International (3-3) commas.
 */
function groupIntegerDigits(digits: string, system: NumberSystem): string {
  if (digits.length <= 3) return digits;
  if (system === 'INTL') {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${groupedRest},${lastThree}`;
}

/**
 * Formats either a numeric value or an in-progress raw input string (preserving
 * trailing decimal point and fractional zeros while typing).
 */
export function formatIndianNumber(
  input: number | string,
  system: NumberSystem = 'IN',
  maxFractionDigits?: number
): string {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return 'Error';
    const clean = sanitizePrecision(input);
    if (Math.abs(clean) >= 1e14 || (clean !== 0 && Math.abs(clean) < 1e-9)) {
      return clean.toExponential(6).replace(/\.?0+e/, 'e');
    }
    const str =
      maxFractionDigits !== undefined
        ? clean.toFixed(maxFractionDigits)
        : String(clean);
    return formatRawNumericString(str, system);
  }

  const trimmed = input.trim();
  if (trimmed === '' || trimmed === 'Error' || trimmed === 'NaN') {
    return trimmed || '0';
  }
  if (trimmed.includes('e') || trimmed.includes('E')) {
    return trimmed;
  }
  return formatRawNumericString(trimmed, system);
}

function formatRawNumericString(raw: string, system: NumberSystem): string {
  const isNegative = raw.startsWith('-');
  const unsigned = isNegative ? raw.slice(1) : raw;
  const hasDecimal = unsigned.includes('.');
  const [intPartRaw, fracPart] = unsigned.split('.');
  const intPart = intPartRaw === '' ? '0' : intPartRaw;

  if (!/^\d+$/.test(intPart)) {
    return raw;
  }

  const groupedInt = groupIntegerDigits(intPart, system);
  const prefix = isNegative ? '−' : '';
  return hasDecimal ? `${prefix}${groupedInt}.${fracPart ?? ''}` : `${prefix}${groupedInt}`;
}

/**
 * Formats a Rupee amount with exact 2 decimal places when paise exist, or clean whole rupees.
 */
export function formatRupees(
  amount: number,
  system: NumberSystem = 'IN',
  alwaysShowPaise = false
): string {
  if (!Number.isFinite(amount)) return '₹0';
  const clean = sanitizePrecision(amount);
  const isNeg = clean < 0;
  const abs = Math.abs(clean);
  const hasPaise = Math.round((abs % 1) * 100) !== 0;
  const formatted = formatIndianNumber(
    abs,
    system,
    alwaysShowPaise || hasPaise ? 2 : 0
  );
  return `${isNeg ? '−' : ''}₹${formatted}`;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigitsToWords(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return one > 0 ? `${TENS[ten]}-${ONES[one]}` : TENS[ten];
}

function threeDigitsToWords(n: number): string {
  const hundred = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (rem > 0) parts.push(twoDigitsToWords(rem));
  return parts.join(' ');
}

function integerToIndianWords(n: number): string {
  if (n === 0) return 'Zero';

  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const remAfterCrore = n % 10000000;
  const lakh = Math.floor(remAfterCrore / 100000);
  const remAfterLakh = remAfterCrore % 100000;
  const thousand = Math.floor(remAfterLakh / 1000);
  const remAfterThousand = remAfterLakh % 1000;

  if (crore > 0) {
    // Handles values >= 100 Crore in standard Indian financial style (e.g., "One Hundred Twenty-Five Crore")
    parts.push(
      `${crore >= 1000 ? integerToIndianWords(crore) : threeDigitsToWords(crore)} Crore`
    );
  }
  if (lakh > 0) {
    parts.push(`${twoDigitsToWords(lakh)} Lakh`);
  }
  if (thousand > 0) {
    parts.push(`${twoDigitsToWords(thousand)} Thousand`);
  }
  if (remAfterThousand > 0) {
    parts.push(threeDigitsToWords(remAfterThousand));
  }

  return parts.join(' ');
}

/**
 * Converts a number into Indian English words (Lakhs & Crores), optionally in Rupee/Paise format.
 */
export function numberToIndianWords(
  value: number,
  asCurrency = true
): string {
  if (!Number.isFinite(value)) return 'Invalid amount';
  const clean = sanitizePrecision(value);
  if (Math.abs(clean) >= 1e14) {
    return 'Amount exceeds Indian word range';
  }

  const isNegative = clean < 0;
  const absVal = Math.abs(clean);

  // Round to nearest paise (2 decimal places) for currency speech
  const totalPaise = Math.round(absVal * 100);
  const wholeRupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  if (!asCurrency) {
    const wholeWords = integerToIndianWords(Math.floor(absVal));
    const prefix = isNegative ? 'Minus ' : '';
    const fracStr = String(absVal).split('.')[1];
    if (!fracStr) return `${prefix}${wholeWords}`;
    const fracDigits = fracStr
      .slice(0, 4)
      .split('')
      .map((d) => (d === '0' ? 'Zero' : ONES[Number(d)]))
      .join(' ');
    return `${prefix}${wholeWords} Point ${fracDigits}`;
  }

  if (wholeRupees === 0 && paise === 0) {
    return 'Zero Rupees';
  }

  const prefix = isNegative ? 'Minus ' : '';
  const parts: string[] = [];

  if (wholeRupees > 0) {
    const rupeeUnit = wholeRupees === 1 ? 'Rupee' : 'Rupees';
    parts.push(`${integerToIndianWords(wholeRupees)} ${rupeeUnit}`);
  }
  if (paise > 0) {
    const paiseUnit = paise === 1 ? 'Paisa' : 'Paise';
    parts.push(`${twoDigitsToWords(paise)} ${paiseUnit}`);
  }

  return `${prefix}${parts.join(' and ')}`;
}
