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
import RoadmapPage from "./pages/RoadmapPage";
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
            <Route index element={<Navigate to="/roadmap/1" replace />} />
            <Route path="roadmap/:id" element={<RoadmapPage />} />
            <Route path="lenses" element={<LensesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch-all: redirect unknown paths to roadmap */}
          <Route path="*" element={<Navigate to="/roadmap/1" replace />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  </React.StrictMode>
);
