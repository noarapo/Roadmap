import React, { useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import ChatPanel from "./components/ChatPanel";
export default function AppLayout() {
  const location = useLocation();
  const isRoadmapPage = location.pathname.startsWith("/roadmap/");
  const [chatOpen, setChatOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleChat = useCallback(() => {
    setChatOpen((prev) => !prev);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  const openMobileMenu = useCallback(() => {
    setMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={closeMobileMenu} />
      <div className="app-main">
        {!isRoadmapPage && (
          <TopBar
            onToggleChat={toggleChat}
            chatOpen={chatOpen}
            onOpenMobileMenu={openMobileMenu}
          />
        )}
        <div className="app-content">
          <Outlet context={{ toggleChat, chatOpen, openMobileMenu }} />
        </div>
      </div>
      <ChatPanel open={chatOpen} onClose={closeChat} onOpenMobileMenu={openMobileMenu} />
    </div>
  );
}
