import type { Express } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { portfolioPositions } from "../../shared/schema";
import { db } from "../db";
import { requireAuth } from "../middleware/auth";
import { newId } from "../utils/id";

const createPositionSchema = z.object({
  symbol: z.string().min(1).max(20),
  label: z.string().max(120).optional().nullable(),
  quantity: z.number().default(0),
  avgCost: z.number().optional().nullable(),
});

const updatePositionSchema = z.object({
  label: z.string().max(120).optional().nullable(),
  quantity: z.number().optional(),
  avgCost: z.number().optional().nullable(),
  active: z.boolean().optional(),
});

export function registerPortfolioRoutes(app: Express): void {
  app.get("/api/portfolio", requireAuth, async (req, res) => {
    const rows = await db.query.portfolioPositions.findMany({
      where: eq(portfolioPositions.userId, req.session.user!.id),
      orderBy: [desc(portfolioPositions.updatedAt)],
    });
    res.json({ positions: rows });
  });

  app.post("/api/portfolio", requireAuth, async (req, res) => {
    const parsed = createPositionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid portfolio payload" });
      return;
    }

    const symbol = parsed.data.symbol.trim().toUpperCase();
    const [created] = await db
      .insert(portfolioPositions)
      .values({
        id: newId(),
        userId: req.session.user!.id,
        symbol,
        label: parsed.data.label ?? null,
        quantity: parsed.data.quantity,
        avgCost: parsed.data.avgCost ?? null,
      })
      .returning();

    res.status(201).json({ position: created });
  });

  app.patch("/api/portfolio/:id", requireAuth, async (req, res) => {
    const parsed = updatePositionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid portfolio update payload" });
      return;
    }

    const [updated] = await db
      .update(portfolioPositions)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(and(eq(portfolioPositions.id, String(req.params.id)), eq(portfolioPositions.userId, req.session.user!.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    res.json({ position: updated });
  });

  app.delete("/api/portfolio/:id", requireAuth, async (req, res) => {
    const [deleted] = await db
      .delete(portfolioPositions)
      .where(and(eq(portfolioPositions.id, String(req.params.id)), eq(portfolioPositions.userId, req.session.user!.id)))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    res.json({ ok: true });
  });
}
