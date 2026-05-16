const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number) {
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return `${TENS[ten]}${one ? ` ${ONES[one]}` : ""}`.trim();
}

function threeDigits(n: number) {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const hundredPart = hundred ? `${ONES[hundred]} Hundred` : "";
  const restPart = rest ? twoDigits(rest) : "";
  return `${hundredPart}${hundredPart && restPart ? " " : ""}${restPart}`.trim();
}

function integerToIndianWords(n: number) {
  if (n === 0) return "Zero";
  let num = Math.floor(Math.abs(n));
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;

  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ").trim();
}

export function amountToRupeesWords(amount: number) {
  const rounded = Math.max(0, Number.isFinite(amount) ? amount : 0);
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  const rupeeWords = integerToIndianWords(rupees);
  if (paise <= 0) return `${rupeeWords} Rupees Only`;
  return `${rupeeWords} Rupees and ${twoDigits(paise)} Paise Only`;
}

