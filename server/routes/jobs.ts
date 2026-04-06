import type { Express } from "express";
import { latestJobRuns } from "../services/news/syncTopic";
import { requireAuth } from "../middleware/auth";

export function registerJobsRoutes(app: Express): void {
  app.get("/api/jobs/latest", requireAuth, async (req, res) => {
    const rows = await latestJobRuns(25);
    res.json({ jobRuns: rows });
  });
}