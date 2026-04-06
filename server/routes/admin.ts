import type { Express } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { invites, users } from "../../shared/schema";
import { db } from "../db";
import { env } from "../env";
import { requireAdmin } from "../middleware/auth";
import { randomToken, sha256 } from "../utils/crypto";
import { newId } from "../utils/id";

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
  expiresInHours: z.number().int().positive().max(720).default(72),
});

export function registerAdminRoutes(app: Express): void {
  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const rows = await db.query.users.findMany({
      orderBy: [desc(users.createdAt)],
    });

    res.json({
      users: rows.map((user) => ({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      })),
    });
  });

  app.get("/api/admin/invites", requireAdmin, async (_req, res) => {
    const rows = await db.query.invites.findMany({
      orderBy: [desc(invites.createdAt)],
    });

    res.json({
      invites: rows.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        acceptedAt: invite.acceptedAt,
        createdAt: invite.createdAt,
      })),
    });
  });

  app.post("/api/admin/invites", requireAdmin, async (req, res) => {
    const parsed = createInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid invite payload" });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      res.status(409).json({ error: "User already exists" });
      return;
    }

    const token = randomToken(24);
    const tokenHash = sha256(token);
    const now = Date.now();
    const expiresAt = new Date(now + parsed.data.expiresInHours * 60 * 60 * 1000);

    await db.insert(invites).values({
      id: newId(),
      email,
      role: parsed.data.role,
      tokenHash,
      invitedByUserId: req.session.user!.id,
      expiresAt,
    });

    const inviteLink = `${env.APP_BASE_URL}/accept-invite?token=${token}`;
    res.status(201).json({
      email,
      role: parsed.data.role,
      expiresAt,
      inviteLink,
    });
  });
}