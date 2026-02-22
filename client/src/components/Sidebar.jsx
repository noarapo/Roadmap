import React, { useState, useRef, useEffect, useCallback } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Columns3,
  Settings,
  LogOut,
  Shield,
  X,
} from "lucide-react";
import { useStore } from "../hooks/useStore";

function getNavItems() {
  const items = [
    { to: "/", icon: Columns3, label: "Roadmaps" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user.is_admin) {
      items.push({ to: "/admin", icon: Shield, label: "Admin" });
    }
  } catch {}
  return items;
}

export default function Sidebar({ mobileOpen, onMobileClose }) {
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

  // Close mobile sidebar when route changes
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="mobile-sidebar-overlay visible"
          onClick={onMobileClose}
        />
      )}

      <nav className={`sidebar${mobileOpen ? " mobile-open" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <NavLink to="/" className="sidebar-logo" onClick={onMobileClose}>
            R
          </NavLink>
          {/* Close button only visible in mobile drawer via CSS */}
          <button
            className="mobile-menu-toggle"
            type="button"
            onClick={onMobileClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-nav">
          {getNavItems().map(({ to, icon: Icon, label }) => {
            const isActive = to === "/"
              ? location.pathname === "/" || location.pathname.startsWith("/roadmap/")
              : location.pathname === to || location.pathname.startsWith(to + "/");

            return (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={`sidebar-btn${isActive ? " active" : ""}`}
                onClick={onMobileClose}
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
    </>
  );
}
