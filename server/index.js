require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { WebSocketServer } = require("ws");

// Initialize database (creates tables on require)
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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// API routes
app.use("/api/auth", authRoutes);
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
  let currentRoomId = null;
  let clientUserId = null;

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
        clientUserId = msg.userId || "anonymous";
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

server.listen(PORT, () => {
  console.log(`Roadway server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
