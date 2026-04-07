import type { FinanceCategory } from "./api";

type ImpactClass =
  | "central_banks"
  | "inflation_jobs"
  | "energy_shock"
  | "metals_supply"
  | "regulation"
  | "exchange_liquidity"
  | "general";

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

const IMPACT_LABELS: Record<ImpactClass, string> = {
  central_banks: "Central bank policy shift",
  inflation_jobs: "Inflation or jobs surprise",
  energy_shock: "Energy supply or demand shock",
  metals_supply: "Metals supply disruption",
  regulation: "Regulatory headline",
  exchange_liquidity: "Exchange/liquidity risk",
  general: "General market signal",
};

export function impactLabel(raw: string): string {
  return IMPACT_LABELS[(raw as ImpactClass) ?? "general"] ?? "General market signal";
}
