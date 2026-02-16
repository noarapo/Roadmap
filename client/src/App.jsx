import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import ChatPanel from "./components/ChatPanel";

export default function AppLayout() {
  const location = useLocation();
  const isRoadmapPage = location.pathname.startsWith("/roadmap/");

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        {!isRoadmapPage && <TopBar />}
        <div className="app-content">
          <Outlet />
        </div>
      </div>
      <ChatPanel />
    </div>
  );
}
