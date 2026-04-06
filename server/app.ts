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
      app: "newsfilter",
      now: new Date().toISOString(),
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

  if (env.NODE_ENV === "production") {
    const clientDist = path.resolve(process.cwd(), "dist/client");
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return app;
}
