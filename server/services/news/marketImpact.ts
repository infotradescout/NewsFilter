import type { ImpactResult } from "./types";

const IMPACT_RULES: Array<{
  impactClass: ImpactResult["impactClass"];
  score: number;
  keywords: RegExp;
  signal: string;
}> = [
  {
    impactClass: "central_banks",
    score: 1,
    keywords: /\b(fed|fomc|ecb|boj|bank of england|interest rate|rate hike|rate cut|policy rate)\b/i,
    signal: "central_bank_signal",
  },
  {
    impactClass: "inflation_jobs",
    score: 0.95,
    keywords: /\b(cpi|pce|ppi|inflation|nonfarm payroll|payrolls|jobless claims|unemployment rate)\b/i,
    signal: "inflation_jobs_signal",
  },
  {
    impactClass: "energy_shock",
    score: 0.9,
    keywords: /\b(oil|brent|wti|opec|natural gas|lng|refinery|pipeline disruption|energy supply)\b/i,
    signal: "energy_shock_signal",
  },
  {
    impactClass: "metals_supply",
    score: 0.82,
    keywords: /\b(gold|silver|copper|lithium|nickel|iron ore|mine output|smelter|metals supply)\b/i,
    signal: "metals_supply_signal",
  },
  {
    impactClass: "regulation",
    score: 0.8,
    keywords: /\b(sec|cftc|regulation|ban|tariff|sanction|compliance rule|capital requirement)\b/i,
    signal: "regulation_signal",
  },
  {
    impactClass: "exchange_liquidity",
    score: 0.85,
    keywords: /\b(exchange outage|liquidation|order book|etf flow|stablecoin depeg|margin call|liquidity crunch)\b/i,
    signal: "exchange_liquidity_signal",
  },
];

export function classifyMarketImpact(text: string): ImpactResult {
  let top: ImpactResult = {
    impactClass: "general",
    score: 0.45,
    matchedSignals: ["general_market_signal"],
  };

  for (const rule of IMPACT_RULES) {
    if (rule.keywords.test(text) && rule.score >= top.score) {
      top = {
        impactClass: rule.impactClass,
        score: rule.score,
        matchedSignals: [rule.signal],
      };
    }
  }

  return top;
}