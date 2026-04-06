import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { env } from "./env";
import { pool } from "./db";

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: env.NODE_ENV === "production",
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
  store: new PgStore({
    pool,
    tableName: "sessions",
    createTableIfMissing: true,
  }),
});
