import React, { useState, useRef, useEffect, useCallback } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Columns3,
  Settings,
  LogOut,
} from "lucide-react";
import { useStore } from "../hooks/useStore";

const NAV_ITEMS = [
  { to: "/roadmap", icon: Columns3, label: "Roadmap", matchPrefix: true },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useStore();
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const avatarMenuRef = useRef(null);

  const initials = currentUser
    ? (currentUser.name || currentUser.email || "U")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const handleLogout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }, [navigate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showAvatarMenu) return;
    function handleClickOutside(e) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) {
        setShowAvatarMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAvatarMenu]);

  return (
    <nav className="sidebar">
      <NavLink to="/roadmap/1" className="sidebar-logo">
        R
      </NavLink>

      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label, matchPrefix }) => {
          const isActive = matchPrefix
            ? location.pathname.startsWith(to)
            : location.pathname === to;

          return (
            <NavLink
              key={to}
              to={to}
              className={`sidebar-btn${isActive ? " active" : ""}`}
            >
              <Icon size={20} />
              <span className="tooltip">{label}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="sidebar-bottom" ref={avatarMenuRef} style={{ position: "relative" }}>
        <div
          className="avatar"
          style={{ cursor: "pointer" }}
          onClick={() => setShowAvatarMenu((v) => !v)}
        >
          {initials}
        </div>
        {showAvatarMenu && (
          <div
            className="avatar-dropdown"
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: 0,
              minWidth: 140,
              background: "var(--bg-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              boxShadow: "var(--shadow-dropdown)",
              zIndex: 40,
              padding: "4px 0",
              animation: "dropdown-in 150ms ease-out",
            }}
          >
            <button
              type="button"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 12px",
                background: "none",
                border: "none",
                fontFamily: "var(--font-family)",
                fontSize: 13,
                color: "var(--text-primary)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              onClick={handleLogout}
            >
              <LogOut size={14} />
              Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
