import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  MessageCircle, X, Send, Check, CheckCheck, SmilePlus, CornerDownRight, Trash2,
} from "lucide-react";
import {
  getComments, createComment, updateComment, deleteComment, resolveComment,
  unresolveComment, toggleReaction, getTeamMembers,
} from "../services/api";

/* ============================================================
   CommentLayer — Figma-style canvas-pinned comments
   Renders as an overlay on top of the roadmap grid.
   ============================================================ */

const REACTIONS = ["👍", "❤️", "👀", "🎉", "😂", "🤔"];

function userInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

export default function CommentLayer({
  roadmapId, canvasRef, sprints, rows, rowHeights,
  rowHeaderWidth, showRowHeaders, getColWidth, commentMode,
  setCommentMode, currentUserId, cards, hidden,
}) {
  const [threads, setThreads] = useState([]);
  const [showResolved, setShowResolved] = useState(false);
  const [activeThread, setActiveThread] = useState(null); // thread id
  const [replyText, setReplyText] = useState("");
  const [newCommentPos, setNewCommentPos] = useState(null); // {x, y, rowId, sprintId, cardId, xPct, yPct}
  const [newCommentText, setNewCommentText] = useState("");
  const [mentionQuery, setMentionQuery] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [showReactionPicker, setShowReactionPicker] = useState(null); // comment id
  const [dragThread, setDragThread] = useState(null); // thread being dragged
  const [dragPos, setDragPos] = useState(null); // {x, y} in canvas coords
  const dragStartRef = useRef(null); // {x, y, threadId} to detect actual drags vs clicks
  const newCommentInputRef = useRef(null);
  const replyInputRef = useRef(null);
  const popoverRef = useRef(null);

  /* ---------- Load comments ---------- */
  const loadComments = useCallback(async () => {
    if (!roadmapId) return;
    try {
      const data = await getComments(roadmapId);
      setThreads(data || []);
    } catch (err) {
      console.error("Failed to load comments:", err);
    }
  }, [roadmapId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  /* ---------- Load team for @mentions ---------- */
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user.workspace_id) {
      getTeamMembers(user.workspace_id).then(setTeamMembers).catch(() => {});
    }
  }, []);

  /* ---------- Listen for WebSocket comment events ---------- */
  useEffect(() => {
    function handleWsMessage(e) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "comment_added") {
          setThreads((prev) => {
            if (msg.comment.parent_comment_id) {
              return prev.map((t) =>
                t.id === msg.comment.parent_comment_id
                  ? { ...t, replies: [...(t.replies || []), msg.comment] }
                  : t
              );
            }
            if (prev.find((t) => t.id === msg.comment.id)) return prev;
            return [...prev, msg.comment];
          });
        } else if (msg.type === "comment_deleted") {
          setThreads((prev) => {
            if (msg.parentCommentId) {
              return prev.map((t) =>
                t.id === msg.parentCommentId
                  ? { ...t, replies: (t.replies || []).filter((r) => r.id !== msg.commentId) }
                  : t
              );
            }
            return prev.filter((t) => t.id !== msg.commentId);
          });
        } else if (msg.type === "comment_resolved" || msg.type === "comment_unresolved") {
          loadComments();
        } else if (msg.type === "comment_reaction") {
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id === msg.commentId) return { ...t, reactions: msg.reactions };
              return {
                ...t,
                replies: (t.replies || []).map((r) =>
                  r.id === msg.commentId ? { ...r, reactions: msg.reactions } : r
                ),
              };
            })
          );
        }
      } catch {}
    }
    // The WS is on window.__roadway_ws if the app sets it up
    // For now, listen via custom events dispatched from RoadmapPage
    window.addEventListener("roadway-ws-message", handleWsMessage);
    return () => window.removeEventListener("roadway-ws-message", handleWsMessage);
  }, [loadComments]);

  /* ---------- Listen for comment clicks from RoadmapPage ---------- */
  useEffect(() => {
    function handleCommentClick(e) {
      const d = e.detail;
      setNewCommentPos({
        rowId: d.rowId,
        sprintId: d.sprintId,
        cardId: d.cardId,
        xPct: d.xPct,
        yPct: d.yPct,
        screenX: d.screenX,
        screenY: d.screenY,
      });
      setNewCommentText("");
      setTimeout(() => newCommentInputRef.current?.focus(), 50);
    }
    window.addEventListener("roadway-comment-click", handleCommentClick);
    return () => window.removeEventListener("roadway-comment-click", handleCommentClick);
  }, []);

  /* ---------- Create comment ---------- */
  const handleCreateComment = useCallback(async () => {
    if (!newCommentText.trim() || !newCommentPos) return;
    try {
      const comment = await createComment({
        roadmap_id: roadmapId,
        text: newCommentText.trim(),
        anchor_type: newCommentPos.cardId ? "card" : "cell",
        card_id: newCommentPos.cardId || undefined,
        anchor_row_id: newCommentPos.rowId,
        anchor_sprint_id: newCommentPos.sprintId,
        anchor_x_pct: newCommentPos.xPct,
        anchor_y_pct: newCommentPos.yPct,
      });
      setThreads((prev) => [...prev, comment]);
      setNewCommentPos(null);
      setNewCommentText("");
      setCommentMode(false);
    } catch (err) {
      console.error("Failed to create comment:", err);
    }
  }, [newCommentText, newCommentPos, roadmapId, setCommentMode]);

  /* ---------- Reply ---------- */
  const handleReply = useCallback(async (threadId) => {
    if (!replyText.trim()) return;
    try {
      const thread = threads.find((t) => t.id === threadId);
      const reply = await createComment({
        roadmap_id: roadmapId,
        text: replyText.trim(),
        parent_comment_id: threadId,
        anchor_type: thread?.anchor_type,
        anchor_row_id: thread?.anchor_row_id,
        anchor_sprint_id: thread?.anchor_sprint_id,
        card_id: thread?.card_id,
      });
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, replies: [...(t.replies || []), reply] } : t
        )
      );
      setReplyText("");
    } catch (err) {
      console.error("Failed to reply:", err);
    }
  }, [replyText, roadmapId, threads]);

  /* ---------- Resolve / Unresolve ---------- */
  const handleResolve = useCallback(async (threadId) => {
    try {
      await resolveComment(threadId);
      setThreads((prev) => prev.map((t) =>
        t.id === threadId ? { ...t, resolved: 1 } : t
      ));
      setActiveThread(null);
    } catch (err) {
      console.error("Failed to resolve:", err);
    }
  }, []);

  const handleUnresolve = useCallback(async (threadId) => {
    try {
      await unresolveComment(threadId);
      setThreads((prev) => prev.map((t) =>
        t.id === threadId ? { ...t, resolved: 0 } : t
      ));
    } catch (err) {
      console.error("Failed to unresolve:", err);
    }
  }, []);

  /* ---------- Delete ---------- */
  const handleDelete = useCallback(async (commentId, parentId) => {
    try {
      await deleteComment(commentId);
      if (parentId) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === parentId
              ? { ...t, replies: (t.replies || []).filter((r) => r.id !== commentId) }
              : t
          )
        );
      } else {
        setThreads((prev) => prev.filter((t) => t.id !== commentId));
        setActiveThread(null);
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }, []);

  /* ---------- Reactions ---------- */
  const handleReaction = useCallback(async (commentId, emoji) => {
    try {
      const reactions = await toggleReaction(commentId, emoji);
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id === commentId) return { ...t, reactions };
          return {
            ...t,
            replies: (t.replies || []).map((r) =>
              r.id === commentId ? { ...r, reactions } : r
            ),
          };
        })
      );
      setShowReactionPicker(null);
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  }, []);

  /* ---------- @mention handling ---------- */
  const handleTextChange = useCallback((text, setter) => {
    setter(text);
    const atMatch = text.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase());
    } else {
      setMentionQuery(null);
    }
  }, []);

  const insertMention = useCallback((name, setter, currentText) => {
    const newText = currentText.replace(/@\w*$/, `@${name} `);
    setter(newText);
    setMentionQuery(null);
  }, []);

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    return teamMembers.filter((m) =>
      m.name.toLowerCase().includes(mentionQuery)
    ).slice(0, 5);
  }, [mentionQuery, teamMembers]);

  /* ---------- Close popover on outside click ---------- */
  useEffect(() => {
    function handleClick(e) {
      if (activeThread && popoverRef.current && !popoverRef.current.contains(e.target) && !e.target.closest(".comment-pin")) {
        setActiveThread(null);
        setShowReactionPicker(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeThread]);

  /* ---------- Close on Escape ---------- */
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") {
        if (newCommentPos) { setNewCommentPos(null); return; }
        if (activeThread) { setActiveThread(null); return; }
        if (commentMode) { setCommentMode(false); }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [commentMode, activeThread, newCommentPos, setCommentMode]);

  /* ---------- Drag to reposition pin ---------- */
  const handlePinMouseDown = useCallback((e, thread) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragStartRef.current = {
      x: e.clientX, y: e.clientY, threadId: thread.id, moved: false,
      // Save original position for snap-back on invalid drop
      origRowId: thread.anchor_row_id, origSprintId: thread.anchor_sprint_id,
      origXPct: thread.anchor_x_pct, origYPct: thread.anchor_y_pct,
    };

    function onMouseMove(ev) {
      const dx = ev.clientX - dragStartRef.current.x;
      const dy = ev.clientY - dragStartRef.current.y;
      if (!dragStartRef.current.moved && Math.sqrt(dx * dx + dy * dy) < 5) return;
      dragStartRef.current.moved = true;

      const canvas = canvasRef?.current;
      if (!canvas) return;
      const canvasRect = canvas.getBoundingClientRect();
      const x = ev.clientX - canvasRect.left + canvas.scrollLeft;
      const y = ev.clientY - canvasRect.top + canvas.scrollTop;
      setDragThread(thread);
      setDragPos({ x, y });
    }

    function onMouseUp(ev) {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      if (!dragStartRef.current || !dragStartRef.current.moved) {
        // It was a click, not a drag — toggle popover
        setDragThread(null);
        setDragPos(null);
        if (dragStartRef.current) {
          setActiveThread((prev) => prev === thread.id ? null : thread.id);
          setShowReactionPicker(null);
          setReplyText("");
        }
        dragStartRef.current = null;
        return;
      }

      const saved = dragStartRef.current;

      // Find which cell the pin was dropped on using the grid directly
      const canvas = canvasRef?.current;
      if (!canvas) { setDragThread(null); setDragPos(null); dragStartRef.current = null; return; }

      // Find the grid cell at the drop point by querying all cells
      let foundCell = null;
      const cells = canvas.querySelectorAll("[data-row-id][data-sprint-id]");
      for (const cell of cells) {
        const r = cell.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          foundCell = cell;
          break;
        }
      }

      if (foundCell) {
        const newRowId = foundCell.dataset.rowId;
        const newSprintId = foundCell.dataset.sprintId;
        const cellRect = foundCell.getBoundingClientRect();
        const xPct = Math.max(5, Math.min(95, ((ev.clientX - cellRect.left) / cellRect.width) * 100));
        const yPct = Math.max(5, Math.min(95, ((ev.clientY - cellRect.top) / cellRect.height) * 100));

        // Update state optimistically
        setThreads((prev) =>
          prev.map((t) =>
            t.id === thread.id
              ? { ...t, anchor_type: "cell", anchor_row_id: newRowId, anchor_sprint_id: newSprintId, anchor_x_pct: xPct, anchor_y_pct: yPct }
              : t
          )
        );

        // Persist to backend
        updateComment(thread.id, {
          anchor_row_id: newRowId,
          anchor_sprint_id: newSprintId,
          anchor_x_pct: xPct,
          anchor_y_pct: yPct,
        }).catch((err) => console.error("Failed to move comment:", err));
      }
      // If dropped outside a valid cell, pin snaps back (dragPos is cleared, original thread data is unchanged)

      setDragThread(null);
      setDragPos(null);
      dragStartRef.current = null;
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [canvasRef]);

  /* ---------- Compute pin position in canvas ---------- */
  const getPinPosition = useCallback((thread) => {
    const canvas = canvasRef?.current;
    if (canvas) {
      // Card-anchored: pin to top-right of the card element
      if (thread.anchor_type === "card" && thread.card_id) {
        const cardEl = canvas.querySelector(`[data-card-id="${thread.card_id}"]`);
        if (cardEl) {
          const canvasRect = canvas.getBoundingClientRect();
          const cardRect = cardEl.getBoundingClientRect();
          return {
            x: cardRect.right - canvasRect.left + canvas.scrollLeft - 2,
            y: cardRect.top - canvasRect.top + canvas.scrollTop + 2,
          };
        }
      }

      // Cell-anchored: use percentage position within cell
      const cell = canvas.querySelector(
        `[data-row-id="${thread.anchor_row_id}"][data-sprint-id="${thread.anchor_sprint_id}"]`
      );
      if (cell) {
        const canvasRect = canvas.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        const x = cellRect.left - canvasRect.left + canvas.scrollLeft + (thread.anchor_x_pct / 100) * cellRect.width;
        const y = cellRect.top - canvasRect.top + canvas.scrollTop + (thread.anchor_y_pct / 100) * cellRect.height;
        return { x, y };
      }
    }

    // Fallback: manual calculation
    let rowTop = 0;
    for (const row of rows) {
      if (row.id === thread.anchor_row_id) break;
      rowTop += rowHeights[row.id] || 80;
    }
    const rowH = rowHeights[thread.anchor_row_id] || 80;
    let sprintLeft = 0;
    let sprintW = 120;
    for (let i = 0; i < sprints.length; i++) {
      if (sprints[i].id === thread.anchor_sprint_id) {
        sprintW = getColWidth(i);
        break;
      }
      sprintLeft += getColWidth(i);
    }
    const headerHeight = 72;
    const leftOffset = showRowHeaders ? rowHeaderWidth : 0;
    return {
      x: leftOffset + sprintLeft + (thread.anchor_x_pct / 100) * sprintW,
      y: headerHeight + rowTop + (thread.anchor_y_pct / 100) * rowH,
    };
  }, [rows, rowHeights, sprints, getColWidth, showRowHeaders, rowHeaderWidth, cards]);

  /* ---------- Filter threads ---------- */
  const visibleThreads = useMemo(() => {
    return threads.filter((t) => showResolved || !t.resolved);
  }, [threads, showResolved]);

  /* ---------- Render comment bubble ---------- */
  function renderPin(thread) {
    const isDraggingThis = dragThread && dragThread.id === thread.id;
    const pos = isDraggingThis && dragPos ? dragPos : getPinPosition(thread);
    const isActive = activeThread === thread.id;

    // Collect unique commenters (thread author + reply authors)
    const commenters = [];
    const seen = new Set();
    const addCommenter = (name, id) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      commenters.push({ name, id });
    };
    addCommenter(thread.user_name, thread.user_id);
    (thread.replies || []).forEach((r) => addCommenter(r.user_name, r.user_id));

    return (
      <div
        key={thread.id}
        className={`comment-pin${isActive ? " active" : ""}${thread.resolved ? " resolved" : ""}${isDraggingThis ? " dragging" : ""}`}
        style={{
          position: "absolute",
          left: pos.x - 14,
          top: pos.y - 14,
          zIndex: isDraggingThis ? 200 : isActive ? 102 : 100,
          pointerEvents: "auto",
        }}
        onMouseDown={(e) => { e.stopPropagation(); handlePinMouseDown(e, thread); }}
        title={`${thread.user_name}: ${thread.text.substring(0, 50)}`}
      >
        <span className="comment-pin-avatar" style={{ background: stringToColor(commenters[0]?.name) }}>
          {userInitials(commenters[0]?.name)}
        </span>
        {commenters.length > 1 && (
          <span className="comment-pin-extra" style={{ background: stringToColor(commenters[1]?.name) }}>
            {commenters.length === 2 ? userInitials(commenters[1]?.name) : `+${commenters.length - 1}`}
          </span>
        )}
      </div>
    );
  }

  /* ---------- Render thread popover ---------- */
  function renderPopover(thread) {
    const pos = getPinPosition(thread);
    const canvas = canvasRef?.current;
    const canvasRect = canvas?.getBoundingClientRect();
    const scrollLeft = canvas?.scrollLeft || 0;
    const scrollTop = canvas?.scrollTop || 0;

    // Position popover to the right of the pin, adjusted for scroll
    const popX = pos.x - scrollLeft + (canvasRect?.left || 0) + 20;
    const popY = pos.y - scrollTop + (canvasRect?.top || 0) - 10;

    // Flip left if too close to right edge
    const flipLeft = popX + 300 > window.innerWidth;

    return (
      <div
        ref={popoverRef}
        className="comment-popover"
        style={{
          position: "fixed",
          left: flipLeft ? popX - 340 : popX,
          top: Math.max(10, Math.min(popY, window.innerHeight - 400)),
          zIndex: 1001,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="comment-popover-header">
          <span className="comment-avatar" style={{ background: stringToColor(thread.user_name), width: 22, height: 22, fontSize: 9 }}>
            {userInitials(thread.user_name)}
          </span>
          <div style={{ flex: 1 }} />
          {thread.resolved ? (
            <button className="comment-action-btn" onClick={() => handleUnresolve(thread.id)} title="Reopen">
              <CheckCheck size={14} /> Reopen
            </button>
          ) : (
            <button className="comment-action-btn resolve" onClick={() => handleResolve(thread.id)} title="Resolve">
              <Check size={14} /> Resolve
            </button>
          )}
          <button className="comment-action-btn" onClick={() => setActiveThread(null)} title="Close">
            <X size={14} />
          </button>
        </div>

        {/* Thread messages */}
        <div className="comment-popover-body">
          {renderMessage(thread, null)}
          {(thread.replies || []).map((reply) => renderMessage(reply, thread.id))}
        </div>

        {/* Reply input */}
        {!thread.resolved && (
          <div className="comment-reply-area">
            <input
              ref={replyInputRef}
              className="comment-input"
              placeholder="Reply... (@ to mention)"
              value={replyText}
              onChange={(e) => handleTextChange(e.target.value, setReplyText)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleReply(thread.id);
                }
              }}
            />
            <button
              className="comment-send-btn"
              disabled={!replyText.trim()}
              onClick={() => handleReply(thread.id)}
            >
              <Send size={14} />
            </button>
            {filteredMembers.length > 0 && (
              <div className="mention-dropdown">
                {filteredMembers.map((m) => (
                  <button key={m.id} className="mention-item"
                    onClick={() => insertMention(m.name, setReplyText, replyText)}>
                    <span className="mention-avatar">{userInitials(m.name)}</span>
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ---------- Render single message ---------- */
  function renderMessage(msg, parentId) {
    const isOwn = msg.user_id === currentUserId;

    return (
      <div key={msg.id} className={`comment-message${parentId ? " reply" : ""}`}>
        <div className="comment-message-header">
          <span className="comment-avatar" style={{ background: stringToColor(msg.user_name) }}>
            {userInitials(msg.user_name)}
          </span>
          <span className="comment-author">{msg.user_name || "Anonymous"}</span>
          <span className="comment-time">{timeAgo(msg.created_at)}</span>
          {isOwn && (
            <button className="comment-delete-btn" onClick={() => handleDelete(msg.id, parentId)} title="Delete">
              <Trash2 size={11} />
            </button>
          )}
        </div>
        <div className="comment-text">{formatMentions(msg.text)}</div>
        {/* Reactions */}
        <div className="comment-reactions">
          {groupReactions(msg.reactions || []).map(([emoji, users]) => (
            <button
              key={emoji}
              className={`reaction-chip${users.some((u) => u.user_id === currentUserId) ? " own" : ""}`}
              onClick={() => handleReaction(msg.id, emoji)}
              title={users.map((u) => u.user_name).join(", ")}
            >
              {emoji} {users.length}
            </button>
          ))}
          <button
            className="reaction-add-btn"
            onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
          >
            <SmilePlus size={13} />
          </button>
          {showReactionPicker === msg.id && (
            <div className="reaction-picker">
              {REACTIONS.map((emoji) => (
                <button key={emoji} className="reaction-pick" onClick={() => handleReaction(msg.id, emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ---------- Render new comment input ---------- */
  function renderNewCommentPopover() {
    if (!newCommentPos) return null;
    return (
      <div
        className="comment-popover new-comment"
        style={{
          position: "fixed",
          left: Math.min(newCommentPos.screenX + 10, window.innerWidth - 320),
          top: Math.min(newCommentPos.screenY - 10, window.innerHeight - 200),
          zIndex: 1001,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="comment-popover-header">
          <MessageCircle size={14} style={{ color: "var(--teal)" }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>New comment</span>
          <div style={{ flex: 1 }} />
          <button className="comment-action-btn" onClick={() => setNewCommentPos(null)}>
            <X size={14} />
          </button>
        </div>
        <div className="comment-reply-area" style={{ borderTop: "none", paddingTop: 0 }}>
          <input
            ref={newCommentInputRef}
            className="comment-input"
            placeholder="Add a comment... (@ to mention)"
            value={newCommentText}
            onChange={(e) => handleTextChange(e.target.value, setNewCommentText)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCreateComment();
              }
              if (e.key === "Escape") setNewCommentPos(null);
            }}
            autoFocus
          />
          <button
            className="comment-send-btn"
            disabled={!newCommentText.trim()}
            onClick={handleCreateComment}
          >
            <Send size={14} />
          </button>
          {filteredMembers.length > 0 && (
            <div className="mention-dropdown">
              {filteredMembers.map((m) => (
                <button key={m.id} className="mention-item"
                  onClick={() => insertMention(m.name, setNewCommentText, newCommentText)}>
                  <span className="mention-avatar">{userInitials(m.name)}</span>
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (hidden) return null;

  return (
    <>
      {/* Pins rendered inside the scrollable canvas */}
      <div className="comment-pins-layer" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
        {visibleThreads.map((thread) => renderPin(thread))}
      </div>

      {/* Active thread popover (fixed position) */}
      {activeThread && threads.find((t) => t.id === activeThread) &&
        renderPopover(threads.find((t) => t.id === activeThread))
      }

      {/* New comment popover */}
      {renderNewCommentPopover()}

      {/* Footer hint — always visible */}
      <div className={`comment-mode-footer${commentMode ? " active" : ""}`}>
        <MessageCircle size={14} />
        {commentMode ? (
          <>
            <span>Click anywhere to add a comment</span>
            <span className="comment-mode-hint">Press <kbd>Esc</kbd> to exit</span>
          </>
        ) : (
          <span>Press <kbd>C</kbd> to comment</span>
        )}
      </div>

      {/* Toggle resolved button */}
      {threads.some((t) => t.resolved) && (
        <button
          className="comment-resolved-toggle"
          onClick={() => setShowResolved(!showResolved)}
        >
          {showResolved ? "Hide resolved" : `Show resolved (${threads.filter((t) => t.resolved).length})`}
        </button>
      )}
    </>
  );
}

/* ===== Utility functions ===== */

function stringToColor(str) {
  if (!str) return "var(--text-muted)";
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ["#2D6A5E", "#4A7EBF", "#9B59B6", "#E67E22", "#E74C3C", "#1ABC9C", "#34495E"];
  return colors[Math.abs(hash) % colors.length];
}

function formatMentions(text) {
  if (!text) return text;
  return text.split(/(@\w+(?:\s\w+)?)/g).map((part, i) =>
    part.startsWith("@") ? <span key={i} className="comment-mention">{part}</span> : part
  );
}

function groupReactions(reactions) {
  const map = {};
  for (const r of reactions) {
    if (!map[r.emoji]) map[r.emoji] = [];
    map[r.emoji].push(r);
  }
  return Object.entries(map);
}
