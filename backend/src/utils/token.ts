import jwt from "jsonwebtoken";

export function signToken(userId: string, secret: string) {
  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}
