import "dotenv/config";
import { z } from "zod";

function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(12),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_SUMMARY_MODEL: z.string().default("gpt-4.1-mini"),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SCHEDULER_ENABLED: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? true : value.toLowerCase() === "true")),
  HOURLY_SYNC_CRON: z.string().default("10 * * * *"),
});

const parsedEnv = envSchema.parse({
  ...process.env,
  OPENAI_API_KEY: nonEmpty(process.env.OPENAI_API_KEY),
  SEED_ADMIN_EMAIL: nonEmpty(process.env.SEED_ADMIN_EMAIL),
  SEED_ADMIN_PASSWORD: nonEmpty(process.env.SEED_ADMIN_PASSWORD),
  APP_BASE_URL:
    nonEmpty(process.env.APP_BASE_URL) ??
    nonEmpty(process.env.RENDER_EXTERNAL_URL) ??
    "http://localhost:5173",
});

export const env = parsedEnv;
