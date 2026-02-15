import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Columns3,
  Target,
  Settings,
} from "lucide-react";
import { useStore } from "../hooks/useStore";

const NAV_ITEMS = [
  { to: "/roadmap", icon: Columns3, label: "Roadmap", matchPrefix: true },
  { to: "/lenses", icon: Target, label: "Lenses" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const location = useLocation();
  const { currentUser } = useStore();

  const initials = currentUser
    ? (currentUser.name || currentUser.email || "U")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

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

      <div className="sidebar-bottom">
        <div className="avatar">{initials}</div>
      </div>
    </nav>
  );
}
