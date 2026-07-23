import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env";
import { sessionMiddleware } from "./session";
import { registerAuthRoutes } from "./routes/auth";
import { registerAdminRoutes } from "./routes/admin";
import { registerTopicRoutes } from "./routes/topics";
import { registerFeedRoutes } from "./routes/feeds";
import { registerWatchTopicRoutes } from "./routes/watchTopics";
import { registerInboxRoutes } from "./routes/inbox";
import { registerJobsRoutes } from "./routes/jobs";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerPortfolioRoutes } from "./routes/portfolio";
import { registerAlertRoutes } from "./routes/alerts";
import { registerCalendarRoutes } from "./routes/calendar";
import { registerPreferencesRoutes } from "./routes/preferences";
import { registerLisaFeedRoutes } from "./routes/lisaFeed";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Required on Render so secure session cookies are honored behind their proxy.
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: env.APP_BASE_URL,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(sessionMiddleware);

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      app: "marketfilter",
      now: new Date().toISOString(),
    });
  });

  // Public machine-readable signal endpoint for LISA source polling.
  app.get("/api/signals", (_req, res) => {
    res.json({
      source: "newsfilter",
      generated_at: new Date().toISOString(),
      count: 1,
      signals: [
        {
          id: Date.now(),
          lane: "market",
          signal_kind: "source_heartbeat",
          confidence: 0.92,
          score: 60,
          impact_level: "low",
          trend: "neutral",
          velocity: "steady",
          action_hint: "newsfilter source healthy",
          tags: ["newsfilter", "heartbeat"],
          source_class: "source_api",
          observed_fact: "NewsFilter API heartbeat is healthy",
        },
      ],
    });
  });

  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerTopicRoutes(app);
  registerFeedRoutes(app);
  registerWatchTopicRoutes(app);
  registerInboxRoutes(app);
  registerJobsRoutes(app);
  registerDashboardRoutes(app);
  registerPortfolioRoutes(app);
  registerAlertRoutes(app);
  registerCalendarRoutes(app);
  registerPreferencesRoutes(app);
  registerLisaFeedRoutes(app);

  if (env.NODE_ENV === "production") {
    const clientDist = path.resolve(process.cwd(), "dist/client");
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return app;
}

