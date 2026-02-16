import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle,
  X,
  Send,
  Plus,
  ChevronLeft,
  Check,
  XCircle,
  Loader,
  Sparkles,
} from "lucide-react";

/* ============================================================
   ChatPanel — Roadway AI floating chat
   A bubble in the bottom-right that expands to a ~350px panel.
   Supports streaming, conversation history, action confirmations,
   and provider toggle (Claude / Gemini).
   ============================================================ */

const API_BASE = "/api/chat";

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ---------- Suggestion chips shown on empty state ---------- */
const SUGGESTIONS = [
  "Summarize this roadmap",
  "What cards are in Sprint 1?",
  "Create a new feature card",
  "Which features are in progress?",
];

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("chat"); // "chat" | "history"
  const [provider, setProvider] = useState("claude");

  /* Conversations */
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  /* Input */
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  /* Streaming state */
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [pendingActions, setPendingActions] = useState([]);

  /* ---------- Auto-scroll to bottom ---------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  /* ---------- Auto-resize textarea ---------- */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  /* ---------- Load conversations when panel opens ---------- */
  useEffect(() => {
    if (open && conversations.length === 0) {
      loadConversations();
    }
  }, [open]);

  /* ---------- Load messages when active conversation changes ---------- */
  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId);
    }
  }, [activeConvId]);

  const loadConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await fetch(`${API_BASE}/conversations`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        // Auto-select most recent if none active
        if (!activeConvId && data.length > 0) {
          setActiveConvId(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoadingConvs(false);
    }
  }, [activeConvId]);

  const loadMessages = useCallback(async (convId) => {
    try {
      const res = await fetch(`${API_BASE}/conversations/${convId}/messages`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  }, []);

  const createConversation = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title: "New conversation" }),
      });
      if (res.ok) {
        const conv = await res.json();
        setConversations((prev) => [conv, ...prev]);
        setActiveConvId(conv.id);
        setMessages([]);
        setView("chat");
      }
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  }, []);

  const deleteConversation = useCallback(async (convId) => {
    try {
      await fetch(`${API_BASE}/conversations/${convId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  }, [activeConvId]);

  /* ---------- Send message with SSE streaming ---------- */
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || streaming) return;

    let convId = activeConvId;

    // Auto-create conversation if none exists
    if (!convId) {
      try {
        const res = await fetch(`${API_BASE}/conversations`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ title: text.trim().substring(0, 60) }),
        });
        if (res.ok) {
          const conv = await res.json();
          setConversations((prev) => [conv, ...prev]);
          setActiveConvId(conv.id);
          convId = conv.id;
        }
      } catch (err) {
        console.error("Failed to create conversation:", err);
        return;
      }
    }

    // Add user message to UI immediately
    const userMsg = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text.trim(),
      actions: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamingText("");
    setPendingActions([]);

    try {
      const res = await fetch(`${API_BASE}/conversations/${convId}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content: text.trim(), provider }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let actions = [];
      let assistantMsgId = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr.trim()) continue;

          try {
            const event = JSON.parse(jsonStr);

            switch (event.type) {
              case "token":
                fullText += event.text;
                setStreamingText(fullText);
                break;
              case "action":
                actions.push(event);
                setPendingActions((prev) => [...prev, event]);
                break;
              case "done":
                assistantMsgId = event.message_id;
                break;
              case "error":
                fullText += `\n\nError: ${event.error}`;
                setStreamingText(fullText);
                break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      // Replace streaming text with final message
      const assistantMsg = {
        id: assistantMsgId || `ai-${Date.now()}`,
        role: "assistant",
        content: fullText || "(action proposed)",
        provider,
        actions: actions.map((a) => ({
          id: a.id,
          action_type: a.action_type,
          action_payload: JSON.stringify(a.action_payload),
          status: a.status,
        })),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update conversation title if it was the first message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId && c.title === "New conversation"
            ? { ...c, title: text.trim().substring(0, 60) + (text.trim().length > 60 ? "..." : "") }
            : c
        )
      );
    } catch (err) {
      console.error("Streaming error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          actions: [],
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setStreaming(false);
      setStreamingText("");
      setPendingActions([]);
    }
  }, [activeConvId, provider, streaming]);

  /* ---------- Confirm / Reject action ---------- */
  const handleAction = useCallback(async (actionId, status) => {
    try {
      const res = await fetch(`${API_BASE}/actions/${actionId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        // Update the action status in messages
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            actions: (m.actions || []).map((a) =>
              a.id === actionId ? { ...a, status } : a
            ),
          }))
        );
        // Notify roadmap page to refresh data
        if (status === "confirmed") {
          window.dispatchEvent(new CustomEvent("roadway-ai-action"));
        }
      }
    } catch (err) {
      console.error("Action update failed:", err);
    }
  }, []);

  /* ---------- Input handlers ---------- */
  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }, [input, sendMessage]);

  const handleSuggestionClick = useCallback((suggestion) => {
    sendMessage(suggestion);
  }, [sendMessage]);

  /* ---------- Render helpers ---------- */

  function renderAction(action) {
    let payload;
    try {
      payload = typeof action.action_payload === "string"
        ? JSON.parse(action.action_payload)
        : action.action_payload;
    } catch {
      payload = {};
    }

    const typeLabels = {
      create_card: "Create card",
      edit_card: "Edit card",
      move_card: "Move card",
      delete_card: "Delete card",
    };

    const label = typeLabels[action.action_type] || action.action_type;
    const detail = payload.name || payload.card_id || "";

    return (
      <div key={action.id} className="chat-action">
        <div className="chat-action-info">
          <span className="chat-action-type">{label}</span>
          {detail && <span className="chat-action-detail">{detail}</span>}
        </div>
        {action.status === "pending" ? (
          <div className="chat-action-buttons">
            <button
              className="chat-action-btn confirm"
              onClick={() => handleAction(action.id, "confirmed")}
              title="Confirm"
            >
              <Check size={14} />
            </button>
            <button
              className="chat-action-btn reject"
              onClick={() => handleAction(action.id, "rejected")}
              title="Reject"
            >
              <XCircle size={14} />
            </button>
          </div>
        ) : (
          <span className={`chat-action-status ${action.status}`}>
            {action.status === "confirmed" ? "Done" : "Rejected"}
          </span>
        )}
      </div>
    );
  }

  /* ---------- Main render ---------- */

  if (!open) {
    return (
      <button className="chat-bubble" onClick={() => setOpen(true)} title="Roadway AI">
        <Sparkles size={22} />
      </button>
    );
  }

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        {view === "history" ? (
          <>
            <button className="chat-header-btn" onClick={() => setView("chat")}>
              <ChevronLeft size={16} />
            </button>
            <span className="chat-header-title">Conversations</span>
          </>
        ) : (
          <>
            <div className="chat-header-brand">
              <Sparkles size={14} />
              <span>Roadway AI</span>
            </div>
            <div className="chat-provider-toggle">
              <button
                className={`chat-provider-btn ${provider === "claude" ? "active" : ""}`}
                onClick={() => setProvider("claude")}
              >
                Claude
              </button>
              <button
                className={`chat-provider-btn ${provider === "gemini" ? "active" : ""}`}
                onClick={() => setProvider("gemini")}
              >
                Gemini
              </button>
            </div>
          </>
        )}
        <div className="chat-header-actions">
          {view === "chat" && (
            <>
              <button className="chat-header-btn" onClick={() => setView("history")} title="History">
                <MessageCircle size={14} />
              </button>
              <button className="chat-header-btn" onClick={createConversation} title="New conversation">
                <Plus size={14} />
              </button>
            </>
          )}
          <button className="chat-header-btn" onClick={() => setOpen(false)} title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="chat-body">
        {view === "history" ? (
          /* Conversation list */
          <div className="chat-conv-list">
            {loadingConvs && (
              <div className="chat-loading">Loading...</div>
            )}
            {!loadingConvs && conversations.length === 0 && (
              <div className="chat-empty-state">
                <p>No conversations yet</p>
                <button className="btn btn-primary btn-sm" onClick={createConversation}>
                  Start a conversation
                </button>
              </div>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`chat-conv-item ${activeConvId === conv.id ? "active" : ""}`}
                onClick={() => {
                  setActiveConvId(conv.id);
                  setView("chat");
                }}
              >
                <div className="chat-conv-title">{conv.title}</div>
                <div className="chat-conv-date">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </div>
                <button
                  className="chat-conv-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* Chat messages */
          <>
            {messages.length === 0 && !streaming && (
              <div className="chat-welcome">
                <Sparkles size={28} style={{ color: "var(--teal)", marginBottom: 8 }} />
                <h3>Roadway AI</h3>
                <p>I can help you manage your roadmap — ask questions, create cards, and more.</p>
                <div className="chat-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="chat-suggestion-chip"
                      onClick={() => handleSuggestionClick(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-msg ${msg.role}`}>
                  {msg.role === "assistant" && (
                    <div className="chat-msg-avatar">
                      <Sparkles size={12} />
                    </div>
                  )}
                  <div className="chat-msg-content">
                    <div className="chat-msg-text">{msg.content}</div>
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="chat-actions-list">
                        {msg.actions.map(renderAction)}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming indicator */}
              {streaming && (
                <div className="chat-msg assistant">
                  <div className="chat-msg-avatar">
                    <Sparkles size={12} />
                  </div>
                  <div className="chat-msg-content">
                    <div className="chat-msg-text">
                      {streamingText || (
                        <span className="chat-typing">
                          <Loader size={14} className="spinning" />
                          Thinking...
                        </span>
                      )}
                    </div>
                    {pendingActions.length > 0 && (
                      <div className="chat-actions-list">
                        {pendingActions.map(renderAction)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>

      {/* Input area (only in chat view) */}
      {view === "chat" && (
        <div className="chat-input-area">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Ask Roadway AI anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={streaming}
          />
          <button
            className="chat-send-btn"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming}
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
