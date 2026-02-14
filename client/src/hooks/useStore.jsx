import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

const StoreContext = createContext(null);

const INITIAL_STATE = {
  currentUser: null,
  workspace: null,
  teams: [],
  roadmaps: [],
  selectedCard: null,
  notifications: [],
};

export function StoreProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(INITIAL_STATE.currentUser);
  const [workspace, setWorkspace] = useState(INITIAL_STATE.workspace);
  const [teams, setTeams] = useState(INITIAL_STATE.teams);
  const [roadmaps, setRoadmaps] = useState(INITIAL_STATE.roadmaps);
  const [selectedCard, setSelectedCard] = useState(INITIAL_STATE.selectedCard);
  const [notifications, setNotifications] = useState(INITIAL_STATE.notifications);

  /* ===== Derived helpers ===== */

  const addRoadmap = useCallback((roadmap) => {
    setRoadmaps((prev) => [...prev, roadmap]);
  }, []);

  const updateRoadmap = useCallback((id, updates) => {
    setRoadmaps((prev) =>
      prev.map((r) => (String(r.id) === String(id) ? { ...r, ...updates } : r))
    );
  }, []);

  const removeRoadmap = useCallback((id) => {
    setRoadmaps((prev) => prev.filter((r) => String(r.id) !== String(id)));
  }, []);

  const addTeam = useCallback((team) => {
    setTeams((prev) => [...prev, team]);
  }, []);

  const updateTeam = useCallback((id, updates) => {
    setTeams((prev) =>
      prev.map((t) => (String(t.id) === String(id) ? { ...t, ...updates } : t))
    );
  }, []);

  const removeTeam = useCallback((id) => {
    setTeams((prev) => prev.filter((t) => String(t.id) !== String(id)));
  }, []);

  const addNotification = useCallback((notification) => {
    setNotifications((prev) => [notification, ...prev]);
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => String(n.id) !== String(id)));
  }, []);

  const markNotificationRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) =>
        String(n.id) === String(id) ? { ...n, read: true } : n
      )
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadNotificationCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const resetStore = useCallback(() => {
    setCurrentUser(INITIAL_STATE.currentUser);
    setWorkspace(INITIAL_STATE.workspace);
    setTeams(INITIAL_STATE.teams);
    setRoadmaps(INITIAL_STATE.roadmaps);
    setSelectedCard(INITIAL_STATE.selectedCard);
    setNotifications(INITIAL_STATE.notifications);
  }, []);

  const value = useMemo(
    () => ({
      /* State values */
      currentUser,
      workspace,
      teams,
      roadmaps,
      selectedCard,
      notifications,
      unreadNotificationCount,

      /* State setters */
      setCurrentUser,
      setWorkspace,
      setTeams,
      setRoadmaps,
      setSelectedCard,
      setNotifications,

      /* Convenience mutators */
      addRoadmap,
      updateRoadmap,
      removeRoadmap,
      addTeam,
      updateTeam,
      removeTeam,
      addNotification,
      removeNotification,
      markNotificationRead,
      clearNotifications,
      resetStore,
    }),
    [
      currentUser,
      workspace,
      teams,
      roadmaps,
      selectedCard,
      notifications,
      unreadNotificationCount,
      addRoadmap,
      updateRoadmap,
      removeRoadmap,
      addTeam,
      updateTeam,
      removeTeam,
      addNotification,
      removeNotification,
      markNotificationRead,
      clearNotifications,
      resetStore,
    ]
  );

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
