import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useStore } from "../hooks/useStore";

const ROUTE_TITLES = {
  "/lenses": "Lenses",
  "/settings": "Settings",
};

export default function TopBar({ title: titleProp, onTitleChange, onToggleChat, chatOpen }) {
  const location = useLocation();
  const params = useParams();
  const { currentUser, roadmaps } = useStore();

  const isRoadmapPage = location.pathname.startsWith("/roadmap/");

  /* Derive the display title */
  let displayTitle = titleProp;
  if (!displayTitle) {
    if (isRoadmapPage && params.id) {
      const roadmap = roadmaps.find(
        (r) => String(r.id) === String(params.id)
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
        {isRoadmapPage ? (
          isEditing ? (
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
          )
        ) : (
          <span className="topbar-title">{displayTitle}</span>
        )}
      </div>

      <div className="topbar-right">
        <button
          className={`roadway-ai-btn${chatOpen ? " active" : ""}`}
          type="button"
          onClick={onToggleChat}
        >
          <Sparkles size={14} />
          Roadway AI
        </button>
      </div>
    </div>
  );
}
