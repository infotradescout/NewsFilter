function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

export function normalizeRules(input: {
  includeTerms?: string[];
  excludeTerms?: string[];
  exactPhrases?: string[];
}) {
  return {
    includeTerms: (input.includeTerms ?? []).map(normalizeToken).filter(Boolean),
    excludeTerms: (input.excludeTerms ?? []).map(normalizeToken).filter(Boolean),
    exactPhrases: (input.exactPhrases ?? []).map(normalizeToken).filter(Boolean),
  };
}

export function scoreKeywordMatch(
  haystackInput: string,
  rules: { includeTerms: string[]; excludeTerms: string[]; exactPhrases: string[] }
) {
  const haystack = haystackInput.toLowerCase();

  const rejectedTerms = rules.excludeTerms.filter((term) => haystack.includes(term));
  if (rejectedTerms.length > 0) {
    return {
      score: 0,
      rejected: true,
      matchedTerms: [] as string[],
      matchedPhrases: [] as string[],
      rejectedTerms,
    };
  }

  const matchedTerms = rules.includeTerms.filter((term) => haystack.includes(term));
  const matchedPhrases = rules.exactPhrases.filter((phrase) => haystack.includes(phrase));

  const includeScore =
    rules.includeTerms.length === 0 ? 0.75 : matchedTerms.length / Math.max(1, rules.includeTerms.length);
  const phraseScore =
    rules.exactPhrases.length === 0
      ? 0.75
      : matchedPhrases.length / Math.max(1, rules.exactPhrases.length);

  const score = Math.max(0, Math.min(1, includeScore * 0.7 + phraseScore * 0.3));

  return {
    score,
    rejected: false,
    matchedTerms,
    matchedPhrases,
    rejectedTerms: [] as string[],
  };
}