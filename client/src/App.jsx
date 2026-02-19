import React, { useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import ChatPanel from "./components/ChatPanel";
import { ToastProvider } from "./components/Toast";

export default function AppLayout() {
  const location = useLocation();
  const isRoadmapPage = location.pathname.startsWith("/roadmap/");
  const [chatOpen, setChatOpen] = useState(true);

  const toggleChat = useCallback(() => {
    setChatOpen((prev) => !prev);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  return (
    <ToastProvider>
      <div className="app-layout">
        <Sidebar />
        <div className="app-main">
          {!isRoadmapPage && <TopBar onToggleChat={toggleChat} chatOpen={chatOpen} />}
          <div className="app-content">
            <Outlet context={{ toggleChat, chatOpen }} />
          </div>
        </div>
        <ChatPanel open={chatOpen} onClose={closeChat} />
      </div>
    </ToastProvider>
  );
}
