import { compare, hash } from "bcryptjs";
import type { Express } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { invites, users } from "../../shared/schema";
import { db } from "../db";
import { env } from "../env";
import { sha256 } from "../utils/crypto";
import { newId } from "../utils/id";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const acceptInviteSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/me", async (req, res) => {
    const sessionUser = req.session.user;
    if (!sessionUser) {
      res.json({ user: null });
      return;
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, sessionUser.id) });
    if (!user) {
      req.session.destroy(() => undefined);
      res.json({ user: null });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid login payload" });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const validPassword = await compare(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  });

  app.post("/api/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid registration payload" });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      res.status(409).json({ error: "Account already exists for this email" });
      return;
    }

    const passwordHash = await hash(parsed.data.password, 12);
    const [createdUser] = await db
      .insert(users)
      .values({
        id: newId(),
        email,
        passwordHash,
        role: "member",
      })
      .returning();

    req.session.user = {
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
    };

    res.status(201).json({
      user: {
        id: createdUser.id,
        email: createdUser.email,
        role: createdUser.role,
      },
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((error) => {
      if (error) {
        res.status(500).json({ error: "Failed to logout" });
        return;
      }

      res.json({ ok: true });
    });
  });

  app.post("/api/invites/accept", async (req, res) => {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid invite acceptance payload" });
      return;
    }

    const tokenHash = sha256(parsed.data.token);
    const invite = await db.query.invites.findFirst({
      where: and(eq(invites.tokenHash, tokenHash), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())),
    });

    if (!invite) {
      res.status(400).json({ error: "Invite token is invalid or expired" });
      return;
    }

    const existingUser = await db.query.users.findFirst({ where: eq(users.email, invite.email.toLowerCase()) });
    if (existingUser) {
      res.status(409).json({ error: "Account already exists for this email" });
      return;
    }

    const passwordHash = await hash(parsed.data.password, 12);
    const newUserId = newId();

    await db.insert(users).values({
      id: newUserId,
      email: invite.email.toLowerCase(),
      passwordHash,
      role: invite.role,
    });

    await db
      .update(invites)
      .set({
        acceptedAt: new Date(),
      })
      .where(eq(invites.id, invite.id));

    req.session.user = {
      id: newUserId,
      email: invite.email.toLowerCase(),
      role: invite.role,
    };

    res.status(201).json({
      user: {
        id: newUserId,
        email: invite.email.toLowerCase(),
        role: invite.role,
      },
      next: `${env.APP_BASE_URL}/`,
    });
  });
}
