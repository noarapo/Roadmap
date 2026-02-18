const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../models/db");
const { validateEmail } = require("../middleware/validate");
const authRoutes = require("./auth");
const authMiddleware = authRoutes.authMiddleware;

const BETA_MAX_MEMBERS = 4;
const INVITE_EXPIRY_DAYS = 7;

// Create nodemailer transporter from env vars (lazy — only created when needed)
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${protocol}://${host}`;
}

// GET /api/invites/members — list current workspace members
router.get("/members", authMiddleware, async (req, res) => {
  try {
    const workspaceId = req.user.workspace_id;
    if (!workspaceId) {
      return res.status(400).json({ error: "No workspace found" });
    }

    const { rows } = await db.query(
      "SELECT id, name, email, role, avatar_url, created_at FROM users WHERE workspace_id = $1 ORDER BY created_at ASC",
      [workspaceId]
    );

    res.json({ members: rows });
  } catch (err) {
    console.error("Get members error:", err);
    res.status(500).json({ error: "Failed to load members" });
  }
});

// GET /api/invites — list pending invites for the workspace
router.get("/", authMiddleware, async (req, res) => {
  try {
    const workspaceId = req.user.workspace_id;
    if (!workspaceId) {
      return res.status(400).json({ error: "No workspace found" });
    }

    const { rows } = await db.query(
      `SELECT i.id, i.email, i.status, i.created_at, i.expires_at, u.name AS invited_by_name
       FROM invites i
       LEFT JOIN users u ON u.id = i.invited_by
       WHERE i.workspace_id = $1 AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [workspaceId]
    );

    res.json({ invites: rows });
  } catch (err) {
    console.error("Get invites error:", err);
    res.status(500).json({ error: "Failed to load invites" });
  }
});

// POST /api/invites — send an invite
router.post("/", authMiddleware, async (req, res) => {
  try {
    const workspaceId = req.user.workspace_id;
    const invitedBy = req.user.id;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const emailErr = validateEmail(email);
    if (emailErr) {
      return res.status(400).json({ error: emailErr });
    }

    if (!workspaceId) {
      return res.status(400).json({ error: "No workspace found" });
    }

    // Check beta member limit
    const { rows: memberRows } = await db.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE workspace_id = $1",
      [workspaceId]
    );
    if (memberRows[0].count >= BETA_MAX_MEMBERS) {
      return res.status(400).json({
        error: "Workspaces are limited to 4 members during the beta",
      });
    }

    // Check if already a member
    const { rows: existingUser } = await db.query(
      "SELECT id FROM users WHERE email = $1 AND workspace_id = $2",
      [email, workspaceId]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({
        error: "This person is already a member of your workspace",
      });
    }

    // Check for existing pending invite
    const { rows: existingInvite } = await db.query(
      "SELECT id FROM invites WHERE email = $1 AND workspace_id = $2 AND status = 'pending' AND expires_at > NOW()",
      [email, workspaceId]
    );
    if (existingInvite.length > 0) {
      return res.status(400).json({
        error: "An invite is already pending for this email",
      });
    }

    // Create invite
    const id = uuidv4();
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO invites (id, email, workspace_id, token, invited_by, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
      [id, email, workspaceId, token, invitedBy, expiresAt]
    );

    // Get workspace name and inviter name for the email
    const { rows: wsRows } = await db.query("SELECT name FROM workspaces WHERE id = $1", [workspaceId]);
    const workspaceName = wsRows[0]?.name || "a workspace";
    const { rows: inviterRows } = await db.query("SELECT name FROM users WHERE id = $1", [invitedBy]);
    const inviterName = inviterRows[0]?.name || "A teammate";

    // Send invite email
    const transporter = getTransporter();
    const appUrl = getAppUrl(req);
    const inviteLink = `${appUrl}/invite/${token}`;

    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: `You've been invited to join ${workspaceName} on Roadway`,
          text: `${inviterName} has invited you to join ${workspaceName} on Roadway.\n\nClick here to accept the invite and create your account:\n${inviteLink}\n\nThis invite expires in ${INVITE_EXPIRY_DAYS} days.`,
          html: `<p>${inviterName} has invited you to join <strong>${workspaceName}</strong> on Roadway.</p>
                 <p><a href="${inviteLink}">Click here to accept the invite and create your account</a></p>
                 <p style="color: #666; font-size: 12px;">This invite expires in ${INVITE_EXPIRY_DAYS} days.</p>`,
        });
      } catch (mailErr) {
        console.error("Failed to send invite email:", mailErr);
        // Invite is still created even if email fails — user can copy link manually
      }
    } else {
      console.warn("SMTP not configured — invite created but no email sent. Link:", inviteLink);
    }

    // Return the created invite
    const { rows: inviteRows } = await db.query(
      `SELECT i.id, i.email, i.status, i.created_at, i.expires_at, u.name AS invited_by_name
       FROM invites i
       LEFT JOIN users u ON u.id = i.invited_by
       WHERE i.id = $1`,
      [id]
    );

    res.status(201).json({ invite: inviteRows[0], invite_link: inviteLink });
  } catch (err) {
    console.error("Create invite error:", err);
    res.status(500).json({ error: "Failed to send invite" });
  }
});

// DELETE /api/invites/:id — revoke a pending invite
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const workspaceId = req.user.workspace_id;
    const inviteId = req.params.id;

    // Verify the invite belongs to this workspace
    const { rows } = await db.query(
      "SELECT id FROM invites WHERE id = $1 AND workspace_id = $2 AND status = 'pending'",
      [inviteId, workspaceId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Invite not found" });
    }

    await db.query(
      "UPDATE invites SET status = 'revoked' WHERE id = $1",
      [inviteId]
    );

    res.status(204).send();
  } catch (err) {
    console.error("Revoke invite error:", err);
    res.status(500).json({ error: "Failed to revoke invite" });
  }
});

// GET /api/invites/verify/:token — verify an invite token (public, no auth)
router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await db.query(
      `SELECT i.id, i.email, i.workspace_id, i.status, i.expires_at, w.name AS workspace_name
       FROM invites i
       LEFT JOIN workspaces w ON w.id = i.workspace_id
       WHERE i.token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Invalid invite link" });
    }

    const invite = rows[0];

    if (invite.status !== "pending") {
      return res.status(400).json({ error: "This invite is no longer valid" });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: "This invite has expired" });
    }

    res.json({
      email: invite.email,
      workspace_name: invite.workspace_name,
      workspace_id: invite.workspace_id,
    });
  } catch (err) {
    console.error("Verify invite error:", err);
    res.status(500).json({ error: "Failed to verify invite" });
  }
});

module.exports = router;
