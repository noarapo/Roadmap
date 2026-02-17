import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./App";
import { StoreProvider } from "./hooks/useStore";
import ProtectedRoute from "./components/ProtectedRoute";
import "./styles/index.css";

import LoginPage from "./pages/LoginPage";
import OnboardingPage from "./pages/OnboardingPage";
import RoadmapPage from "./pages/RoadmapPage";
import SettingsPage from "./pages/SettingsPage";
import RoadmapListPage from "./pages/RoadmapListPage";

function SmartRedirect() {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (user.lastRoadmapId) {
    return <Navigate to={`/roadmap/${user.lastRoadmapId}`} replace />;
  }
  return <Navigate to="/roadmaps" replace />;
}

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
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<SmartRedirect />} />
            <Route path="roadmaps" element={<RoadmapListPage />} />
            <Route path="roadmap/:id" element={<RoadmapPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<SmartRedirect />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  </React.StrictMode>
);
