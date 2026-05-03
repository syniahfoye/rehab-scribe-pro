import type { RequestHandler } from "express";
import type { UserRole } from "../../shared/types.js";

export const roleHierarchy: Record<UserRole, number> = {
  auditor: 1,
  nurse: 2,
  physician: 3,
  admin: 4
};

export const requireRole = (minimumRole: UserRole): RequestHandler => {
  return (req, res, next) => {
    const role = (req.header("x-user-role") || "auditor") as UserRole;
    if (!roleHierarchy[role] || roleHierarchy[role] < roleHierarchy[minimumRole]) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
};

export const requireMfaHeader: RequestHandler = (req, res, next) => {
  const mfa = req.header("x-mfa-verified");
  if (mfa !== "true") {
    res.status(401).json({ error: "MFA required" });
    return;
  }
  next();
};
