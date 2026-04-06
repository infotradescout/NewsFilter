import type { FinanceCategory } from "./api";

const CATEGORY_LABELS: Record<FinanceCategory, string> = {
  macro: "Big Economy",
  commodities: "Oil, Gas & Metals",
  equities: "Stocks & Earnings",
  crypto: "Crypto & Exchanges",
};

const CATEGORY_HELP: Record<FinanceCategory, string> = {
  macro: "Rates, inflation, jobs, and central bank updates.",
  commodities: "Energy and raw materials like oil, gas, gold, and copper.",
  equities: "Company earnings, guidance, analyst calls, and stock moves.",
  crypto: "Bitcoin, Ethereum, exchanges, ETF flows, and regulation.",
};

export function categoryLabel(category: FinanceCategory): string {
  return CATEGORY_LABELS[category];
}

export function categoryHelp(category: FinanceCategory): string {
  return CATEGORY_HELP[category];
}
