import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { jobRuns } from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { buildLisaFeed } from "../services/news/lisaFeed";
import { newId } from "../utils/id";

const lisaFeedQuerySchema = z.object({
  since_last_publish: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

const publishBodySchema = z.object({
  since_last_publish: z.boolean().optional().default(false),
});

export function registerLisaFeedRoutes(app: Express): void {
  app.get("/api/lisa-feed", requireAuth, async (req, res) => {
    const parsed = lisaFeedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid LISA feed query" });
      return;
    }

    const user = req.session.user!;
    const feed = await buildLisaFeed({
      user: { id: user.id, role: user.role },
      since_last_publish: parsed.data.since_last_publish,
    });

    res.json(feed);
  });

  app.get("/api/lisa-feed/export", requireAuth, async (req, res) => {
    const parsed = z
      .object({
        format: z.enum(["json", "ndjson"]).optional().default("json"),
        since_last_publish: z
          .string()
          .optional()
          .transform((value) => value === "true"),
      })
      .safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid export query" });
      return;
    }

    const user = req.session.user!;
    const feed = await buildLisaFeed({
      user: { id: user.id, role: user.role },
      since_last_publish: parsed.data.since_last_publish,
    });

    if (parsed.data.format === "ndjson") {
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=newsfilter-lisa-feed.ndjson");
      res.send(feed.ndjson);
      return;
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=newsfilter-lisa-feed.json");
    res.send(JSON.stringify(feed.payload, null, 2));
  });

  app.post("/api/lisa-feed/publish", requireAuth, async (req, res) => {
    const parsed = publishBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid publish payload" });
      return;
    }

    const user = req.session.user!;
    const jobName = `lisa_feed_publish:${user.id}`;
    const jobId = newId();

    await db.insert(jobRuns).values({
      id: jobId,
      jobName,
      trigger: "manual",
      status: "running",
    });

    try {
      const feed = await buildLisaFeed({
        user: { id: user.id, role: user.role },
        since_last_publish: parsed.data.since_last_publish,
      });

      const publishedPayload = {
        ...feed.payload,
        packets: feed.payload.packets.map((packet) => ({
          ...packet,
          publish_status: "published" as const,
        })),
      };

      await db
        .update(jobRuns)
        .set({
          status: "success",
          finishedAt: new Date(),
          fetchedCount: feed.stats.topics_considered,
          vettedCount: feed.stats.events_emitted,
          summarizedCount: feed.payload.packets.length,
          metadata: {
            source_system: "newsfilter",
            since_last_publish: parsed.data.since_last_publish,
            packet_count: feed.payload.packets.length,
            item_count: publishedPayload.packets.reduce((sum, packet) => sum + packet.items.length, 0),
            packet_types: publishedPayload.packets.map((packet) => packet.packet_type),
            published_at: new Date().toISOString(),
          },
        })
        .where(and(eq(jobRuns.id, jobId), eq(jobRuns.jobName, jobName)));

      res.json({
        ok: true,
        published_at: new Date().toISOString(),
        packet_count: publishedPayload.packets.length,
        item_count: publishedPayload.packets.reduce((sum, packet) => sum + packet.items.length, 0),
        payload: publishedPayload,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish LISA feed";
      await db
        .update(jobRuns)
        .set({
          status: "failed",
          finishedAt: new Date(),
          errorMessage: message,
        })
        .where(and(eq(jobRuns.id, jobId), eq(jobRuns.jobName, jobName)));

      res.status(500).json({ error: message });
    }
  });
}
