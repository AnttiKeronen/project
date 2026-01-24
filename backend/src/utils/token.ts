import jwt from "jsonwebtoken";
//create JWT containing user id, valid for 7 days
export function signToken(userId: string, secret: string) {
  return jwt.sign({ userId }, secret, { expiresIn: "7d" });
}
