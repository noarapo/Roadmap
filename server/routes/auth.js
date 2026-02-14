const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");

const JWT_SECRET = process.env.JWT_SECRET || "roadway-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, workspace_id: user.workspace_id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// POST /api/auth/signup
router.post("/signup", (req, res) => {
  try {
    const { name, email, password, workspace_name } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Check if user already exists
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const userId = uuidv4();
    const workspaceId = uuidv4();

    // Create workspace
    db.prepare(
      "INSERT INTO workspaces (id, name, owner_user_id) VALUES (?, ?, ?)"
    ).run(workspaceId, workspace_name || `${name}'s Workspace`, userId);

    // Create user
    db.prepare(
      "INSERT INTO users (id, name, email, password_hash, workspace_id, role) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(userId, name, email, password_hash, workspaceId, "admin");

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    const token = generateToken(user);

    res.status(201).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/google - Placeholder for Google OAuth
router.post("/google", (req, res) => {
  try {
    const { google_token, name, email, avatar_url } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // In production, verify the google_token with Google's API
    // For now, we trust the provided info as a placeholder

    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user) {
      // Auto-create user and workspace for new Google sign-ins
      const userId = uuidv4();
      const workspaceId = uuidv4();

      db.prepare(
        "INSERT INTO workspaces (id, name, owner_user_id) VALUES (?, ?, ?)"
      ).run(workspaceId, `${name || email}'s Workspace`, userId);

      db.prepare(
        "INSERT INTO users (id, name, email, avatar_url, workspace_id, role) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(userId, name || email, email, avatar_url || null, workspaceId, "admin");

      user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    }

    const token = generateToken(user);

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware for protecting routes - exported for use by other routes
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// GET /api/auth/me - Get current user
router.get("/me", authMiddleware, (req, res) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.authMiddleware = authMiddleware;

module.exports = router;
