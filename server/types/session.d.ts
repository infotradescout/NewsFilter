import "express-session";
import type { Role } from "../../shared/types";

declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      role: Role;
    };
  }
}