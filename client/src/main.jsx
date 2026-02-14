import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import RoadmapList from "./pages/RoadmapList";
import RoadmapDetail from "./pages/RoadmapDetail";
import AgentPanel from "./pages/AgentPanel";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<RoadmapList />} />
          <Route path="roadmap/:id" element={<RoadmapDetail />} />
          <Route path="agent" element={<AgentPanel />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
