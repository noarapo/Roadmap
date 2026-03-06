import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { Sparkles, Menu, ChevronDown, Plus, Check, Map, HelpCircle } from "lucide-react";
import { useStore } from "../hooks/useStore";
import { getRoadmaps, createRoadmap, updateProfile } from "../services/api";

const ROUTE_TITLES = {
  "/settings": "Settings",
};

export default function TopBar({ title: titleProp, onTitleChange, onToggleChat, chatOpen, onOpenMobileMenu, onReplayTutorial }) {
  const location = useLocation();
  const params = useParams();
  const navigate = useNavigate();
  const { currentUser, roadmaps, addRoadmap } = useStore();

  const isRoadmapPage = location.pathname.startsWith("/roadmap/");
  const currentRoadmapId = params.id;

  /* Derive the display title */
  let displayTitle = titleProp;
  if (!displayTitle) {
    if (isRoadmapPage && currentRoadmapId) {
      const roadmap = roadmaps.find(
        (r) => String(r.id) === String(currentRoadmapId)
      );
      displayTitle = roadmap ? roadmap.name : "Untitled Roadmap";
    } else {
      displayTitle = ROUTE_TITLES[location.pathname] || "Roadway";
    }
  }

  /* Editable title state for roadmap pages */
  const [editValue, setEditValue] = useState(displayTitle);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  /* Roadmap switcher dropdown state */
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [allRoadmaps, setAllRoadmaps] = useState([]);
  const [creating, setCreating] = useState(false);
  const switcherRef = useRef(null);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const workspaceId = user.workspace_id;

  /* Fetch all roadmaps when dropdown opens */
  useEffect(() => {
    if (switcherOpen && workspaceId) {
      getRoadmaps(workspaceId)
        .then((data) => setAllRoadmaps(Array.isArray(data) ? data : []))
        .catch(() => setAllRoadmaps([]));
    }
  }, [switcherOpen, workspaceId]);

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!switcherOpen) return;
    function handleClickOutside(e) {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [switcherOpen]);

  useEffect(() => {
    setEditValue(displayTitle);
  }, [displayTitle]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== displayTitle && onTitleChange) {
      onTitleChange(trimmed);
    } else {
      setEditValue(displayTitle);
    }
  }, [editValue, displayTitle, onTitleChange]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        commitEdit();
      } else if (e.key === "Escape") {
        setEditValue(displayTitle);
        setIsEditing(false);
      }
    },
    [commitEdit, displayTitle]
  );

  /* Navigate to a different roadmap */
  function handleSwitchRoadmap(rmId) {
    setSwitcherOpen(false);
    if (String(rmId) === String(currentRoadmapId)) return;
    updateProfile({ last_roadmap_id: rmId }).catch(() => {});
    const updatedUser = { ...user, lastRoadmapId: rmId, last_roadmap_id: rmId };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    navigate(`/roadmap/${rmId}`);
  }

  /* Create a new roadmap from the dropdown */
  async function handleCreateRoadmap() {
    if (!workspaceId || creating) return;
    setCreating(true);
    try {
      const rm = await createRoadmap(workspaceId, {
        workspace_id: workspaceId,
        name: "Untitled Roadmap",
        created_by: user.id,
      });
      await updateProfile({ last_roadmap_id: rm.id });
      const updatedUser = { ...user, lastRoadmapId: rm.id, last_roadmap_id: rm.id };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      if (addRoadmap) addRoadmap(rm);
      setSwitcherOpen(false);
      navigate(`/roadmap/${rm.id}`);
    } catch (err) {
      console.error("Failed to create roadmap:", err);
    } finally {
      setCreating(false);
    }
  }

  const initials = currentUser
    ? (currentUser.name || currentUser.email || "U")
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="topbar">
      <div className="topbar-left">
        {/* Hamburger menu — only visible on mobile via CSS */}
        <button
          className="mobile-menu-toggle"
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {isRoadmapPage ? (
          <div className="rm-switcher-wrapper" ref={switcherRef}>
            <div className="rm-switcher-trigger">
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="topbar-title-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleKeyDown}
                />
              ) : (
                <span
                  className="topbar-title"
                  onDoubleClick={() => setIsEditing(true)}
                  title="Double-click to rename"
                >
                  {displayTitle}
                </span>
              )}
              <button
                className="rm-switcher-chevron"
                type="button"
                onClick={() => setSwitcherOpen((v) => !v)}
                aria-label="Switch roadmap"
              >
                <ChevronDown size={16} className={switcherOpen ? "rm-switcher-chevron-rotated" : ""} />
              </button>
            </div>

            {switcherOpen && (
              <div className="rm-switcher-dropdown">
                <div className="rm-switcher-list">
                  {allRoadmaps.map((rm) => {
                    const isCurrent = String(rm.id) === String(currentRoadmapId);
                    return (
                      <button
                        key={rm.id}
                        type="button"
                        className={`rm-switcher-item${isCurrent ? " rm-switcher-item-active" : ""}`}
                        onClick={() => handleSwitchRoadmap(rm.id)}
                      >
                        <Map size={14} className="rm-switcher-item-icon" />
                        <span className="rm-switcher-item-name">{rm.name}</span>
                        {isCurrent && <Check size={14} className="rm-switcher-item-check" />}
                      </button>
                    );
                  })}
                </div>
                <div className="rm-switcher-divider" />
                <button
                  type="button"
                  className="rm-switcher-item rm-switcher-create"
                  onClick={handleCreateRoadmap}
                  disabled={creating}
                >
                  <Plus size={14} className="rm-switcher-item-icon" />
                  <span className="rm-switcher-item-name">
                    {creating ? "Creating..." : "New Roadmap"}
                  </span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <span className="topbar-title">{displayTitle}</span>
        )}
      </div>

      <div className="topbar-right">
        {currentUser?.is_admin && onReplayTutorial && (
          <button
            className="topbar-help-btn"
            type="button"
            onClick={onReplayTutorial}
            title="Replay tutorial"
          >
            <HelpCircle size={16} />
          </button>
        )}
        <button
          className={`roadway-ai-btn${chatOpen ? " active" : ""}`}
          type="button"
          onClick={onToggleChat}
        >
          <Sparkles size={14} />
          <span className="ai-btn-label">AI Assistant</span>
        </button>
      </div>
    </div>
  );
}
