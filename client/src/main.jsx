import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./App";
import { StoreProvider } from "./hooks/useStore";
import ProtectedRoute from "./components/ProtectedRoute";
import "./styles/index.css";

import LoginPage from "./pages/LoginPage";
import RoadmapPage from "./pages/RoadmapPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/AdminPage";
import InvitePage from "./pages/InvitePage";
import OnboardingPage from "./pages/OnboardingPage";
import { getRoadmaps, createRoadmap, updateProfile } from "./services/api";

function SmartRedirect() {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  if (user.onboarding_completed === false) {
    return <Navigate to="/onboarding" replace />;
  }

  const lastRmId = user.lastRoadmapId || user.last_roadmap_id;
  if (lastRmId) {
    return <Navigate to={`/roadmap/${lastRmId}`} replace />;
  }

  /* No lastRoadmapId — need to fetch roadmaps and redirect to the first one */
  return <FetchAndRedirect user={user} />;
}

function FetchAndRedirect({ user }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!user.workspace_id) {
      setTarget("/settings");
      return;
    }
    getRoadmaps(user.workspace_id)
      .then(async (data) => {
        const list = Array.isArray(data) ? data : [];
        if (list.length > 0) {
          const rmId = list[0].id;
          updateProfile({ last_roadmap_id: rmId }).catch(() => {});
          const updatedUser = { ...user, lastRoadmapId: rmId, last_roadmap_id: rmId };
          localStorage.setItem("user", JSON.stringify(updatedUser));
          setTarget(`/roadmap/${rmId}`);
        } else {
          /* No roadmaps exist — create one automatically */
          try {
            const rm = await createRoadmap(user.workspace_id, {
              workspace_id: user.workspace_id,
              name: "Untitled Roadmap",
              created_by: user.id,
            });
            await updateProfile({ last_roadmap_id: rm.id });
            const updatedUser = { ...user, lastRoadmapId: rm.id, last_roadmap_id: rm.id };
            localStorage.setItem("user", JSON.stringify(updatedUser));
            setTarget(`/roadmap/${rm.id}`);
          } catch {
            /* Fallback: just go to settings if roadmap creation fails */
            setTarget("/settings");
          }
        }
      })
      .catch(() => {
        setTarget("/settings");
      });
  }, [user]);

  if (target) return <Navigate to={target} replace />;

  return (
    <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
      <span style={{ color: "#A0AEC0", fontSize: 14 }}>Loading...</span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<LoginPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />

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
            {/* /roadmaps route removed — roadmap switching is now in TopBar dropdown */}
            <Route path="roadmaps" element={<SmartRedirect />} />
            <Route path="roadmap/:id" element={<RoadmapPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<SmartRedirect />} />
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  </React.StrictMode>
);
