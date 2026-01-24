import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
// extend Express Request
export interface AuthedRequest extends Request {
  userId?: string;
}
// middleware to protect routes
export function requireAuthentication(secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    // require Bearer token
    if (!auth?.startsWith("Bearer ")) return res.status(401).json({ message: "Missing token" });
    const token = auth.slice("Bearer ".length);
    try {
      const payload = jwt.verify(token, secret) as { userId: string };
      req.userId = payload.userId;
      next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
}
