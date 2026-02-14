import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./App";
import { StoreProvider } from "./hooks/useStore";
import "./styles/index.css";

/* Page-level components are lazily referenced to avoid circular imports.
   They are imported here so the router can reference them directly. */
import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import WorkspacesPage from "./pages/WorkspacesPage";
import RoadmapPage from "./pages/RoadmapPage";
import CapacityPage from "./pages/CapacityPage";
import AdvisorPage from "./pages/AdvisorPage";
import LensesPage from "./pages/LensesPage";
import SettingsPage from "./pages/SettingsPage";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* Authenticated routes inside AppLayout */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/workspaces" replace />} />
            <Route path="workspaces" element={<WorkspacesPage />} />
            <Route path="roadmap/:id" element={<RoadmapPage />} />
            <Route path="capacity" element={<CapacityPage />} />
            <Route path="advisor" element={<AdvisorPage />} />
            <Route path="lenses" element={<LensesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch-all: redirect unknown paths to workspaces */}
          <Route path="*" element={<Navigate to="/workspaces" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  </React.StrictMode>
);
