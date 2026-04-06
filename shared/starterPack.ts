export type StarterFeedCategory = "macro" | "commodities" | "equities" | "crypto" | "general";

export interface StarterFeedPreset {
  key: string;
  name: string;
  url: string;
  type: "custom_rss" | "google_query";
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
    type: "custom_rss",
    category: "general",
    description: "Fast-moving global business and markets coverage.",
  },
  {
    key: "cnbc-top",
    name: "CNBC Top News",
    url: "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    type: "custom_rss",
    category: "general",
    description: "Broad US market-moving headlines.",
  },
  {
    key: "marketwatch-top",
    name: "MarketWatch Top Stories",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/",
    type: "custom_rss",
    category: "equities",
    description: "Equities and macro-sensitive US market stories.",
  },
  {
    key: "yahoo-finance",
    name: "Yahoo Finance News",
    url: "https://finance.yahoo.com/news/rssindex",
    type: "custom_rss",
    category: "equities",
    description: "Corporate earnings, analyst moves, and market news.",
  },
  {
    key: "federal-reserve-press",
    name: "Federal Reserve Press Releases",
    url: "https://www.federalreserve.gov/feeds/press_monetary.xml",
    type: "custom_rss",
    category: "macro",
    description: "Primary-source Fed policy announcements.",
  },
  {
    key: "stl-fed-ote",
    name: "St. Louis Fed - On The Economy",
    url: "https://www.stlouisfed.org/on-the-economy/feed",
    type: "custom_rss",
    category: "macro",
    description: "US macro analysis from the Federal Reserve system.",
  },
  {
    key: "eia-press",
    name: "US EIA Press Releases",
    url: "https://www.eia.gov/rss/press_rss.xml",
    type: "custom_rss",
    category: "commodities",
    description: "Energy supply, inventories, and policy-impact updates.",
  },
  {
    key: "eia-today-energy",
    name: "US EIA Today in Energy",
    url: "https://www.eia.gov/todayinenergy/rss.php",
    type: "custom_rss",
    category: "commodities",
    description: "Daily energy market datapoints and trends.",
  },
  {
    key: "investing-commodities",
    name: "Investing.com Commodities",
    url: "https://www.investing.com/rss/news_11.rss",
    type: "custom_rss",
    category: "commodities",
    description: "Oil, gas, and metals headlines.",
  },
  {
    key: "oil-markets-google",
    name: "Oil Markets (Google Stream)",
    url: "brent wti opec supply cuts refinery outages sanctions",
    type: "google_query",
    category: "commodities",
    description: "Dedicated oil/energy market-moving headline stream.",
  },
  {
    key: "lng-gas-google",
    name: "Natural Gas & LNG (Google Stream)",
    url: "natural gas lng storage inventories export terminal outage",
    type: "google_query",
    category: "commodities",
    description: "Natural gas and LNG risk headlines.",
  },
  {
    key: "metals-google",
    name: "Copper & Metals (Google Stream)",
    url: "copper aluminum nickel zinc smelter mine disruption",
    type: "google_query",
    category: "commodities",
    description: "Base metals supply and demand catalysts.",
  },
  {
    key: "precious-metals-google",
    name: "Gold & Silver (Google Stream)",
    url: "gold silver bullion central bank purchases real yields",
    type: "google_query",
    category: "commodities",
    description: "Precious metals macro-sensitive updates.",
  },
  {
    key: "agri-google",
    name: "Agriculture Crops (Google Stream)",
    url: "corn wheat soybean crop yield drought usda wasde",
    type: "google_query",
    category: "commodities",
    description: "Crop shocks, harvests, and agriculture reports.",
  },
  {
    key: "shipping-google",
    name: "Shipping & Freight (Google Stream)",
    url: "dry bulk freight rates shipping chokepoint disruption",
    type: "google_query",
    category: "commodities",
    description: "Freight/logistics moves that impact commodity pricing.",
  },
  {
    key: "tradingeconomics-commodities-google",
    name: "TradingEconomics Commodities (Google Stream)",
    url: "site:tradingeconomics.com commodities forecast oil gold copper",
    type: "google_query",
    category: "commodities",
    description: "Commodities headlines and forecasts from TradingEconomics coverage.",
  },
  {
    key: "coindesk",
    name: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    type: "custom_rss",
    category: "crypto",
    description: "Crypto markets, ETF flows, and regulation coverage.",
  },
  {
    key: "cointelegraph",
    name: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    type: "custom_rss",
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
    key: "commodities-agri-weather",
    name: "Agriculture: Crops & Weather Risk",
    category: "commodities",
    window: "24h",
    queryText: "corn wheat soybean weather drought usda wasde yield",
    includeTerms: ["corn", "wheat", "soybean", "drought", "yield", "usda", "wasde"],
    excludeTerms: ["recipe", "restaurant"],
    exactPhrases: ["crop yield", "weather risk"],
    description: "Tracks crop and weather shocks with commodity impact.",
  },
  {
    key: "commodities-shipping",
    name: "Commodities: Shipping & Freight Stress",
    category: "commodities",
    window: "24h",
    queryText: "shipping freight dry bulk tanker chokepoint port disruption",
    includeTerms: ["shipping", "freight", "dry bulk", "tanker", "port", "disruption"],
    excludeTerms: ["cruise", "travel tips"],
    exactPhrases: ["freight rate", "port disruption"],
    description: "Tracks freight bottlenecks that influence commodity pricing.",
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
