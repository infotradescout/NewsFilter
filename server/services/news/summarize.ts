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
    .slice(0, 1)
    .map((bullet) => trimWords(bullet.replace(/^[-*\s]+/, ""), 18))
    .filter(Boolean);

  return {
    headline: cleanHeadline || "Market update",
    bullets: cleanBullets.length > 0 ? cleanBullets : ["Relevant market move detected."],
  };
}

function fallbackSummary(title: string, snippet: string): SummaryOutput {
  const cleanedSnippet = snippet.trim();
  const sentence = cleanedSnippet
    ? trimWords(cleanedSnippet, 18)
    : "Potential market-moving development. Review source.";
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

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function stripHtml(input: string): string {
  return collapseWhitespace(
    input
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
  );
}

async function fetchArticleContext(articleUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(articleUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) return "";
    const html = await response.text();

    const ogDescriptionMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const descriptionMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const paragraphMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .slice(0, 8)
      .map((match) => stripHtml(match[1] ?? ""))
      .filter((text) => text.length > 40);

    const chunks = [
      ogDescriptionMatch?.[1] ?? "",
      descriptionMatch?.[1] ?? "",
      ...paragraphMatches,
    ]
      .map((text) => collapseWhitespace(text))
      .filter(Boolean);

    return trimWords(chunks.join(" "), 140);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function summarizeArticle(args: {
  topicName: string;
  articleTitle: string;
  articleSnippet: string;
  articleUrl: string;
  sourceDomain: string;
  publishedAt: Date;
}): Promise<SummaryOutput> {
  if (!env.OPENAI_API_KEY) {
    return fallbackSummary(args.articleTitle, args.articleSnippet);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const articleContext = await fetchArticleContext(args.articleUrl);

  const prompt = [
    `Topic: ${args.topicName}`,
    `Article title: ${args.articleTitle}`,
    `Snippet: ${args.articleSnippet}`,
    `Article URL: ${args.articleUrl}`,
    `Article context excerpt: ${articleContext || "Not available"}`,
    `Source: ${args.sourceDomain}`,
    `Published: ${args.publishedAt.toISOString()}`,
    "Return strict JSON: {\"headline\": string, \"bullets\": string[] }",
    "Constraints: headline <= 12 words; max 1 bullet; bullet <= 18 words; minimal wording.",
    "Bullet must explain why this matters for markets (rates, growth, risk, supply, liquidity, or regulation).",
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
            "You are a financial news compressor. Use the provided article context and URL details. Be precise, minimal, and avoid speculation. Output only JSON.",
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
