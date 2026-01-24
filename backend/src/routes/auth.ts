import { Router } from "express";
import bcrypt from "bcrypt";
import { User } from "../models/User";
import { signToken } from "../utils/token";

export function authRoutes(jwtSecret: string) {
  const r = Router();
   //register new user and return jwt
  r.post("/register", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ message: "I need Email and Password" });
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "Your email is already in use" });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash });
    const token = signToken(String(user._id), jwtSecret);
    res.json({ token });
  });
  //authenticate user and return jwt
  r.post("/login", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ message: "I need Email and Password" });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Naah, give me the correct ones" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Naah, give me the correct ones" });
    const token = signToken(String(user._id), jwtSecret);
    res.json({ token });
  });
  return r;
}
