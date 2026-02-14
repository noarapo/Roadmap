const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./models/db");
const roadmapRoutes = require("./routes/roadmaps");
const agentRoutes = require("./routes/agent");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/roadmaps", roadmapRoutes);
app.use("/api/agent", agentRoutes);

// Serve static frontend in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../client/dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/dist/index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
