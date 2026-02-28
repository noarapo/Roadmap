import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

const StoreContext = createContext(null);

const INITIAL_STATE = {
  currentUser: null,
  workspace: null,
  teams: [],
  roadmaps: [],
  selectedCard: null,
};

export function StoreProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(INITIAL_STATE.currentUser);
  const [workspace, setWorkspace] = useState(INITIAL_STATE.workspace);
  const [teams, setTeams] = useState(INITIAL_STATE.teams);
  const [roadmaps, setRoadmaps] = useState(INITIAL_STATE.roadmaps);
  const [selectedCard, setSelectedCard] = useState(INITIAL_STATE.selectedCard);

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

  const resetStore = useCallback(() => {
    setCurrentUser(INITIAL_STATE.currentUser);
    setWorkspace(INITIAL_STATE.workspace);
    setTeams(INITIAL_STATE.teams);
    setRoadmaps(INITIAL_STATE.roadmaps);
    setSelectedCard(INITIAL_STATE.selectedCard);
  }, []);

  const value = useMemo(
    () => ({
      /* State values */
      currentUser,
      workspace,
      teams,
      roadmaps,
      selectedCard,

      /* State setters */
      setCurrentUser,
      setWorkspace,
      setTeams,
      setRoadmaps,
      setSelectedCard,

      /* Convenience mutators */
      addRoadmap,
      updateRoadmap,
      removeRoadmap,
      addTeam,
      updateTeam,
      removeTeam,
      resetStore,
    }),
    [
      currentUser,
      workspace,
      teams,
      roadmaps,
      selectedCard,
      addRoadmap,
      updateRoadmap,
      removeRoadmap,
      addTeam,
      updateTeam,
      removeTeam,
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
