const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../models/db");
const { validateEmail, validateLength, sanitizeHtml, MAX_NAME_LENGTH } = require("../middleware/validate");

// Enforce JWT_SECRET in production
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is required in production");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET || "roadway-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, workspace_id: user.workspace_id, role: user.role, is_admin: user.is_admin },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

function safeError(err) {
  if (process.env.NODE_ENV === "production") {
    return "Internal server error";
  }
  return err.message;
}

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, workspace_name } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    // Validate email format
    const emailErr = validateEmail(email);
    if (emailErr) {
      return res.status(400).json({ error: emailErr });
    }

    // Validate lengths
    const nameErr = validateLength(name, "Name", MAX_NAME_LENGTH);
    if (nameErr) return res.status(400).json({ error: nameErr });

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (workspace_name) {
      const wsErr = validateLength(workspace_name, "Workspace name", MAX_NAME_LENGTH);
      if (wsErr) return res.status(400).json({ error: wsErr });
    }

    // Check if user already exists
    const { rows: existingRows } = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existingRows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const userId = uuidv4();
    const workspaceId = uuidv4();

    // Create workspace
    const sanitizedWsName = sanitizeHtml(workspace_name || `${name}'s Workspace`);
    await db.query(
      "INSERT INTO workspaces (id, name, owner_user_id) VALUES ($1, $2, $3)",
      [workspaceId, sanitizedWsName, userId]
    );

    // Create user
    const sanitizedName = sanitizeHtml(name);
    await db.query(
      "INSERT INTO users (id, name, email, password_hash, workspace_id, role) VALUES ($1, $2, $3, $4, $5, $6)",
      [userId, sanitizedName, email, password_hash, workspaceId, "admin"]
    );

    const { rows: userRows } = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userRows[0];
    const token = generateToken(user);

    res.status(201).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const { rows: userRows } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = userRows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last_login_at
    await db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    const token = generateToken(user);

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// POST /api/auth/google - Placeholder for Google OAuth
router.post("/google", async (req, res) => {
  try {
    const { google_token, name, email, avatar_url } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const emailErr = validateEmail(email);
    if (emailErr) {
      return res.status(400).json({ error: emailErr });
    }

    // In production, verify the google_token with Google's API
    // For now, we trust the provided info as a placeholder

    const { rows: userRows } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    let user = userRows[0];

    if (!user) {
      // Auto-create user and workspace for new Google sign-ins
      const userId = uuidv4();
      const workspaceId = uuidv4();

      const sanitizedName = sanitizeHtml(name || email);
      await db.query(
        "INSERT INTO workspaces (id, name, owner_user_id) VALUES ($1, $2, $3)",
        [workspaceId, `${sanitizedName}'s Workspace`, userId]
      );

      await db.query(
        "INSERT INTO users (id, name, email, avatar_url, workspace_id, role) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, sanitizedName, email, avatar_url || null, workspaceId, "admin"]
      );

      const { rows: newUserRows } = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
      user = newUserRows[0];
    }

    // Update last_login_at
    await db.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    const token = generateToken(user);

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
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
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// PUT /api/auth/me - Update current user profile
router.put("/me", authMiddleware, async (req, res) => {
  try {
    // Handle password change
    if (req.body.new_password) {
      const { rows: userRows } = await db.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
      const user = userRows[0];
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (!req.body.password) {
        return res.status(400).json({ error: "Current password is required" });
      }
      const valid = bcrypt.compareSync(req.body.password, user.password_hash);
      if (!valid) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }
      if (req.body.new_password.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
      }
      const newHash = bcrypt.hashSync(req.body.new_password, 10);
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, req.user.id]);
    }

    const allowed = ["name", "avatar_url", "last_roadmap_id"];
    const sets = [];
    const values = [];
    let paramIndex = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let val = req.body[key];
        if (key === "name") {
          const nameErr = validateLength(val, "Name", MAX_NAME_LENGTH);
          if (nameErr) return res.status(400).json({ error: nameErr });
          val = sanitizeHtml(val);
        }
        sets.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }
    }

    if (sets.length > 0) {
      values.push(req.user.id);
      await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${paramIndex}`, values);
    }

    const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

router.authMiddleware = authMiddleware;
router.adminMiddleware = adminMiddleware;
// Export JWT_SECRET for WebSocket auth verification
router.JWT_SECRET = JWT_SECRET;

module.exports = router;
