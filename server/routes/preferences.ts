import type { Express } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { userPreferences } from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";

const savePreferencesSchema = z.object({
  blockedDomains: z.array(z.string()).default([]),
  trustOverrides: z.record(z.string(), z.number().min(0).max(1)).default({}),
});

export function registerPreferencesRoutes(app: Express): void {
  app.get("/api/preferences", requireAuth, async (req, res) => {
    const userId = req.session.user!.id;
    let row = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) });

    if (!row) {
      const [created] = await db
        .insert(userPreferences)
        .values({
          userId,
          blockedDomains: [],
          trustOverrides: {},
        })
        .returning();
      row = created;
    }

    res.json({
      preferences: {
        blockedDomains: row.blockedDomains,
        trustOverrides: row.trustOverrides,
      },
    });
  });

  app.put("/api/preferences", requireAuth, async (req, res) => {
    const parsed = savePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid preferences payload" });
      return;
    }

    const userId = req.session.user!.id;
    await db
      .insert(userPreferences)
      .values({
        userId,
        blockedDomains: parsed.data.blockedDomains.map((item) => item.trim().toLowerCase()),
        trustOverrides: parsed.data.trustOverrides,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId],
        set: {
          blockedDomains: parsed.data.blockedDomains.map((item) => item.trim().toLowerCase()),
          trustOverrides: parsed.data.trustOverrides,
          updatedAt: new Date(),
        },
      });

    res.json({ ok: true });
  });
}
