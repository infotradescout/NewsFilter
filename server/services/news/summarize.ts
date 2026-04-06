import OpenAI from "openai";
import { env } from "../../env";
import type { SummaryOutput } from "./types";

export function trimWords(input: string, maxWords: number): string {
  const words = input.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

export function enforceSummaryShape(headline: string, bullets: string[]): { headline: string; bullets: string[] } {
  const cleanHeadline = trimWords(headline || "Market update", 12);
  const cleanBullets = bullets
    .slice(0, 2)
    .map((bullet) => trimWords(bullet.replace(/^[-*\s]+/, ""), 18))
    .filter(Boolean);

  return {
    headline: cleanHeadline || "Market update",
    bullets: cleanBullets.length > 0 ? cleanBullets : ["Relevant market move detected."],
  };
}

function fallbackSummary(title: string, snippet: string): SummaryOutput {
  const blended = `${title}. ${snippet}`.trim();
  const sentence = trimWords(blended, 18);
  const shaped = enforceSummaryShape(trimWords(title, 12), [sentence]);
  return {
    headline: shaped.headline,
    bullets: shaped.bullets,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: "extractive-fallback",
  };
}

export async function summarizeArticle(args: {
  topicName: string;
  articleTitle: string;
  articleSnippet: string;
  sourceDomain: string;
  publishedAt: Date;
}): Promise<SummaryOutput> {
  if (!env.OPENAI_API_KEY) {
    return fallbackSummary(args.articleTitle, args.articleSnippet);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const prompt = [
    `Topic: ${args.topicName}`,
    `Article title: ${args.articleTitle}`,
    `Snippet: ${args.articleSnippet}`,
    `Source: ${args.sourceDomain}`,
    `Published: ${args.publishedAt.toISOString()}`,
    "Return strict JSON: {\"headline\": string, \"bullets\": string[] }",
    "Constraints: headline <= 12 words; max 2 bullets; each bullet <= 18 words; minimal wording.",
  ].join("\n");

  try {
    const response = await client.chat.completions.create({
      model: env.OPENAI_SUMMARY_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a financial news compressor. Be precise, minimal, and avoid speculation. Output only JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { headline?: string; bullets?: string[] };
    const shaped = enforceSummaryShape(parsed.headline ?? args.articleTitle, parsed.bullets ?? []);

    return {
      headline: shaped.headline,
      bullets: shaped.bullets,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
      model: env.OPENAI_SUMMARY_MODEL,
    };
  } catch {
    return fallbackSummary(args.articleTitle, args.articleSnippet);
  }
}