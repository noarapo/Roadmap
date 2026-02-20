require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

// Import database module
const db = require("./models/db");

// Import route modules
const authRoutes = require("./routes/auth");
const roadmapRoutes = require("./routes/roadmaps");
const cardRoutes = require("./routes/cards");
const teamRoutes = require("./routes/teams");
const lensRoutes = require("./routes/lenses");
const tagRoutes = require("./routes/tags");
const snapshotRoutes = require("./routes/snapshots");
const commentRoutes = require("./routes/comments");
const sprintRoutes = require("./routes/sprints");
const chatRoutes = require("./routes/chat");
const workspaceSettingsRoutes = require("./routes/workspace-settings");
const customFieldRoutes = require("./routes/custom-fields");
const adminRoutes = require("./routes/admin");
const inviteRoutes = require("./routes/invites");
const onboardingRoutes = require("./routes/onboarding");

const JWT_SECRET = authRoutes.JWT_SECRET;

const app = express();
const PORT = process.env.PORT || 3001;

// =====================
// CORS — restrict origins via env var
// =====================
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : null;

app.use(
  cors(
    allowedOrigins
      ? {
          origin(origin, callback) {
            // Allow requests with no origin (server-to-server, curl, etc.)
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error("Not allowed by CORS"));
            }
          },
          credentials: true,
        }
      : undefined // default: allow all origins in development
  )
);
app.use(express.json({ limit: "10mb" }));

// Security headers in production
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
}

// =====================
// RATE LIMITING
// =====================

// Auth rate limiter: 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
  keyGenerator: (req) => req.ip,
});

// General API rate limiter: 100 requests per minute per user (or IP if unauthenticated)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  keyGenerator: (req) => {
    if (req.user && req.user.id) return req.user.id;
    return req.ip;
  },
});

// AI chat rate limiter: 10 requests per minute per user
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests, please try again later" },
  keyGenerator: (req) => {
    if (req.user && req.user.id) return req.user.id;
    return req.ip;
  },
});

// Apply auth rate limiter to login/signup endpoints
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/google", authLimiter);

// Apply general API rate limiter to all API routes
app.use("/api", apiLimiter);

// Apply chat-specific rate limiter
app.use("/api/chat", chatLimiter);

// API routes
app.use("/api/auth", authRoutes);
// AI health check — no auth, protected by admin email query param
app.get("/api/ai-health", async (req, res) => {
  if (req.query.key !== process.env.ADMIN_EMAIL) return res.status(403).json({ error: "Forbidden" });
  const checks = {
    anthropic_key_set: !!process.env.ANTHROPIC_API_KEY,
    anthropic_key_length: (process.env.ANTHROPIC_API_KEY || "").length,
    gemini_key_set: !!process.env.GEMINI_API_KEY,
    node_env: process.env.NODE_ENV,
  };
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({ model: "claude-sonnet-4-5-20250929", max_tokens: 10, messages: [{ role: "user", content: "Hi" }] });
    checks.anthropic_status = "ok";
    checks.anthropic_response = resp.content[0]?.text?.substring(0, 50);
  } catch (err) {
    checks.anthropic_status = "error";
    checks.anthropic_error = `${err.status || ""} ${err.message}`.trim();
  }
  res.json(checks);
});

app.use("/api/roadmaps", roadmapRoutes);
app.use("/api/cards", cardRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/lenses", lensRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/snapshots", snapshotRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/sprints", sprintRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/workspace-settings", workspaceSettingsRoutes);
app.use("/api/custom-fields", customFieldRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/onboarding", onboardingRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve static frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../client/dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/dist/index.html"));
  });
}

// Create HTTP server
const server = http.createServer(app);

// WebSocket server setup
const wss = new WebSocketServer({ server, path: "/ws" });

// Track connected clients by roadmap
const roomClients = new Map();

wss.on("connection", (ws, req) => {
  // Authenticate WebSocket connection via token query param
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Authentication required");
    return;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    ws.close(4001, "Invalid or expired token");
    return;
  }

  let currentRoomId = null;
  const clientUserId = decoded.id;
  const clientWorkspaceId = decoded.workspace_id;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "join": {
        // Join a roadmap room
        currentRoomId = msg.roadmapId;
        if (!roomClients.has(currentRoomId)) {
          roomClients.set(currentRoomId, new Set());
        }
        roomClients.get(currentRoomId).add(ws);

        // Notify others in the room
        broadcast(currentRoomId, {
          type: "user_joined",
          userId: clientUserId,
          timestamp: new Date().toISOString(),
        }, ws);
        break;
      }

      case "leave": {
        leaveRoom(ws, currentRoomId, clientUserId);
        currentRoomId = null;
        break;
      }

      case "card_update": {
        // Broadcast card changes to others in the same roadmap
        broadcast(currentRoomId, {
          type: "card_update",
          userId: clientUserId,
          card: msg.card,
          timestamp: new Date().toISOString(),
        }, ws);
        break;
      }

      case "card_move": {
        broadcast(currentRoomId, {
          type: "card_move",
          userId: clientUserId,
          cardId: msg.cardId,
          rowId: msg.rowId,
          sortOrder: msg.sortOrder,
          timestamp: new Date().toISOString(),
        }, ws);
        break;
      }

      case "row_update": {
        broadcast(currentRoomId, {
          type: "row_update",
          userId: clientUserId,
          row: msg.row,
          timestamp: new Date().toISOString(),
        }, ws);
        break;
      }

      case "cursor": {
        // Share cursor position for collaborative awareness
        broadcast(currentRoomId, {
          type: "cursor",
          userId: clientUserId,
          x: msg.x,
          y: msg.y,
        }, ws);
        break;
      }

      default: {
        // Generic broadcast for extensibility
        if (currentRoomId) {
          broadcast(currentRoomId, {
            ...msg,
            userId: clientUserId,
            timestamp: new Date().toISOString(),
          }, ws);
        }
      }
    }
  });

  ws.on("close", () => {
    leaveRoom(ws, currentRoomId, clientUserId);
  });

  ws.on("error", () => {
    leaveRoom(ws, currentRoomId, clientUserId);
  });
});

function broadcast(roomId, message, excludeWs) {
  if (!roomId || !roomClients.has(roomId)) return;
  const data = JSON.stringify(message);
  for (const client of roomClients.get(roomId)) {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(data);
    }
  }
}

function leaveRoom(ws, roomId, userId) {
  if (!roomId || !roomClients.has(roomId)) return;
  roomClients.get(roomId).delete(ws);
  if (roomClients.get(roomId).size === 0) {
    roomClients.delete(roomId);
  } else {
    broadcast(roomId, {
      type: "user_left",
      userId: userId,
      timestamp: new Date().toISOString(),
    });
  }
}

// Export for external use (e.g., broadcast from routes)
app.locals.broadcast = broadcast;

// Initialize database and start server
(async () => {
  try {
    await db.initDb();
    console.log("Database initialized successfully");
    server.listen(PORT, () => {
      console.log(`Roadway server running on http://localhost:${PORT}`);
      console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    });
  } catch (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  }
})();
