import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function App() {
  const location = useLocation();

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="logo">Roadmap Planner</Link>
        <nav>
          <Link to="/" className={location.pathname === "/" ? "active" : ""}>
            Roadmaps
          </Link>
          <Link to="/agent" className={location.pathname === "/agent" ? "active" : ""}>
            Developer Agent
          </Link>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
