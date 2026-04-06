export type StarterFeedCategory = "macro" | "commodities" | "equities" | "crypto" | "general";

export interface StarterFeedPreset {
  key: string;
  name: string;
  url: string;
  category: StarterFeedCategory;
  description: string;
}

export interface StarterTopicPreset {
  key: string;
  name: string;
  category: "macro" | "commodities" | "equities" | "crypto";
  window: "24h" | "7d" | "30d";
  queryText: string;
  includeTerms: string[];
  excludeTerms: string[];
  exactPhrases: string[];
  description: string;
}

export const FREE_FINANCE_FEED_PRESETS: StarterFeedPreset[] = [
  {
    key: "reuters-business",
    name: "Reuters Business",
    url: "https://www.reuters.com/business/rss",
    category: "general",
    description: "Fast-moving global business and markets coverage.",
  },
  {
    key: "cnbc-top",
    name: "CNBC Top News",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    category: "general",
    description: "Broad US market-moving headlines.",
  },
  {
    key: "marketwatch-top",
    name: "MarketWatch Top Stories",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/",
    category: "equities",
    description: "Equities and macro-sensitive US market stories.",
  },
  {
    key: "yahoo-finance",
    name: "Yahoo Finance News",
    url: "https://finance.yahoo.com/news/rssindex",
    category: "equities",
    description: "Corporate earnings, analyst moves, and market news.",
  },
  {
    key: "federal-reserve-press",
    name: "Federal Reserve Press Releases",
    url: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    category: "macro",
    description: "Primary-source Fed policy announcements.",
  },
  {
    key: "stl-fed-ote",
    name: "St. Louis Fed - On The Economy",
    url: "https://www.stlouisfed.org/on-the-economy/feed",
    category: "macro",
    description: "US macro analysis from the Federal Reserve system.",
  },
  {
    key: "eia-press",
    name: "US EIA Press Releases",
    url: "https://www.eia.gov/rss/press_rss.xml",
    category: "commodities",
    description: "Energy supply, inventories, and policy-impact updates.",
  },
  {
    key: "investing-commodities",
    name: "Investing.com Commodities",
    url: "https://www.investing.com/rss/news_11.rss",
    category: "commodities",
    description: "Oil, gas, and metals headlines.",
  },
  {
    key: "coindesk",
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    category: "crypto",
    description: "Crypto markets, ETF flows, and regulation coverage.",
  },
  {
    key: "cointelegraph",
    name: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    category: "crypto",
    description: "Crypto ecosystem and exchange/liquidity updates.",
  },
];

export const STARTER_TOPIC_PRESETS: StarterTopicPreset[] = [
  {
    key: "macro-rates-inflation",
    name: "Big Economy: Rates & Inflation",
    category: "macro",
    window: "24h",
    queryText: "federal reserve cpi pce payrolls inflation interest rate",
    includeTerms: ["federal reserve", "cpi", "inflation", "pce", "payrolls", "interest rate"],
    excludeTerms: ["sports", "celebrity", "entertainment"],
    exactPhrases: ["core inflation", "rate decision"],
    description: "Tracks interest rates, inflation, and jobs data.",
  },
  {
    key: "commodities-energy-metals",
    name: "Oil, Gas & Metals Watch",
    category: "commodities",
    window: "24h",
    queryText: "brent wti opec natural gas copper gold supply disruption",
    includeTerms: ["brent", "wti", "opec", "natural gas", "copper", "gold", "supply"],
    excludeTerms: ["lifestyle", "travel"],
    exactPhrases: ["supply disruption", "production cut"],
    description: "Tracks supply and price shocks in energy and metals.",
  },
  {
    key: "equities-earnings-risk",
    name: "Stocks: Earnings & Outlook",
    category: "equities",
    window: "24h",
    queryText: "earnings guidance downgrade upgrade outlook margin warning",
    includeTerms: ["earnings", "guidance", "downgrade", "upgrade", "outlook", "margin"],
    excludeTerms: ["movie", "music"],
    exactPhrases: ["earnings miss", "forward guidance"],
    description: "Tracks company earnings updates that move stocks.",
  },
  {
    key: "crypto-etf-liquidity",
    name: "Crypto: Flows & Exchange Risk",
    category: "crypto",
    window: "24h",
    queryText: "bitcoin ethereum etf inflow outflow exchange liquidity regulation",
    includeTerms: ["bitcoin", "ethereum", "etf", "inflow", "outflow", "exchange", "liquidity"],
    excludeTerms: ["nft art", "gaming"],
    exactPhrases: ["exchange outage", "stablecoin depeg"],
    description: "Tracks crypto flow, exchange, and regulation risk.",
  },
];
