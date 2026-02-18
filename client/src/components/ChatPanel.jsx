import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle,
  X,
  Plus,
  ChevronLeft,
  Check,
  XCircle,
  Loader,
  Sparkles,
  ArrowUp,
  Paperclip,
  FileText,
  Upload,
  CheckCircle,
} from "lucide-react";

/* ============================================================
   ChatPanel — Roadway AI side drawer (Cursor-style)
   Slides in from the right edge of the screen.
   Supports streaming, conversation history, action confirmations,
   file upload for bulk feature import, and provider toggle
   (Claude / Gemini).
   ============================================================ */

const API_BASE = "/api/chat";

function authHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function authHeadersMultipart() {
  const token = localStorage.getItem("token");
  return {
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

export default function ChatPanel({ open, onClose }) {
  const [view, setView] = useState("chat"); // "chat" | "history"
  const provider = "claude";

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

  /* File upload state */
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  /* ---------- Auto-scroll to bottom ---------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  /* ---------- Auto-resize textarea ---------- */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + "px";
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
      const res = await fetch(`${API_BASE}/conversations`, {
        headers: authHeaders(),
      });
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
      const res = await fetch(
        `${API_BASE}/conversations/${convId}/messages`,
        { headers: authHeaders() }
      );
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

  const deleteConversation = useCallback(
    async (convId) => {
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
    },
    [activeConvId]
  );

  /* ---------- Ensure a conversation exists, creating one if needed ---------- */
  const ensureConversation = useCallback(async (title) => {
    let convId = activeConvId;
    if (!convId) {
      try {
        const res = await fetch(`${API_BASE}/conversations`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ title: title || "New conversation" }),
        });
        if (res.ok) {
          const conv = await res.json();
          setConversations((prev) => [conv, ...prev]);
          setActiveConvId(conv.id);
          convId = conv.id;
        }
      } catch (err) {
        console.error("Failed to create conversation:", err);
        return null;
      }
    }
    return convId;
  }, [activeConvId]);

  /* ---------- Send message with SSE streaming ---------- */
  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || streaming) return;

      let convId = await ensureConversation(text.trim().substring(0, 60));
      if (!convId) return;

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
        const res = await fetch(
          `${API_BASE}/conversations/${convId}/messages`,
          {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ content: text.trim(), provider }),
          }
        );

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
              ? {
                  ...c,
                  title:
                    text.trim().substring(0, 60) +
                    (text.trim().length > 60 ? "..." : ""),
                }
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
    },
    [activeConvId, provider, streaming, ensureConversation]
  );

  /* ---------- File upload handler ---------- */
  const handleFileUpload = useCallback(
    async (file) => {
      if (!file || uploading || streaming) return;

      setSelectedFile(null);
      setUploading(true);

      // Add user message showing the upload
      const userMsg = {
        id: `temp-upload-${Date.now()}`,
        role: "user",
        content: `Uploaded file: ${file.name}`,
        isUpload: true,
        fileName: file.name,
        actions: [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Ensure we have a conversation
      let convId = await ensureConversation(`Import: ${file.name}`.substring(0, 60));
      if (!convId) {
        setUploading(false);
        return;
      }

      // Update conversation title
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId && c.title === "New conversation"
            ? { ...c, title: `Import: ${file.name}`.substring(0, 60) }
            : c
        )
      );

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("provider", provider);
        formData.append("conversation_id", convId);

        const res = await fetch(`${API_BASE}/upload`, {
          method: "POST",
          headers: authHeadersMultipart(),
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Upload failed (${res.status})`);
        }

        const data = await res.json();

        // Build assistant message with actions
        const assistantMsg = {
          id: data.message_id || `ai-upload-${Date.now()}`,
          role: "assistant",
          content: data.summary || "I analyzed your file.",
          provider,
          actions: data.actions || [],
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        console.error("Upload error:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `Failed to process file: ${err.message}`,
            actions: [],
            created_at: new Date().toISOString(),
          },
        ]);
      } finally {
        setUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [activeConvId, provider, uploading, streaming, ensureConversation]
  );

  const handleFileSelect = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const handleAttachClick = useCallback(() => {
    if (fileInputRef.current && !uploading && !streaming) {
      fileInputRef.current.click();
    }
  }, [uploading, streaming]);

  /* ---------- Listen for import file events from roadmap page ---------- */
  useEffect(() => {
    function handleImportFileEvent(e) {
      const { file } = e.detail || {};
      if (file) {
        // Ensure view is on chat
        setView("chat");
        // Small delay to ensure panel is open and ready
        setTimeout(() => {
          handleFileUpload(file);
        }, 300);
      }
    }
    window.addEventListener("roadway-import-file", handleImportFileEvent);
    return () => window.removeEventListener("roadway-import-file", handleImportFileEvent);
  }, [handleFileUpload]);

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

  /* ---------- Confirm / Reject all pending actions for a message ---------- */
  const handleAllActions = useCallback(
    async (msgId, status) => {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg || !msg.actions) return;

      const pendingOnes = msg.actions.filter((a) => a.status === "pending");
      for (const action of pendingOnes) {
        await handleAction(action.id, status);
      }
    },
    [messages, handleAction]
  );

  /* ---------- Input handlers ---------- */
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    },
    [input, sendMessage]
  );

  const handleSuggestionClick = useCallback(
    (suggestion) => {
      sendMessage(suggestion);
    },
    [sendMessage]
  );

  /* ---------- Render helpers ---------- */

  function renderAction(action) {
    let payload;
    try {
      payload =
        typeof action.action_payload === "string"
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
      <div key={action.id} className="cd-action">
        <div className="cd-action-info">
          <span className="cd-action-type">{label}</span>
          {detail && <span className="cd-action-detail">{detail}</span>}
        </div>
        {action.status === "pending" ? (
          <div className="cd-action-buttons">
            <button
              className="cd-action-btn confirm"
              onClick={() => handleAction(action.id, "confirmed")}
              title="Confirm"
            >
              <Check size={14} />
            </button>
            <button
              className="cd-action-btn reject"
              onClick={() => handleAction(action.id, "rejected")}
              title="Reject"
            >
              <XCircle size={14} />
            </button>
          </div>
        ) : (
          <span className={`cd-action-status ${action.status}`}>
            {action.status === "confirmed" ? "Done" : "Rejected"}
          </span>
        )}
      </div>
    );
  }

  function renderBulkActionButtons(msg) {
    if (!msg.actions || msg.actions.length < 2) return null;
    const pendingCount = msg.actions.filter((a) => a.status === "pending").length;
    if (pendingCount < 2) return null;

    return (
      <div className="cd-bulk-actions">
        <button
          className="cd-bulk-btn confirm"
          onClick={() => handleAllActions(msg.id, "confirmed")}
        >
          <CheckCircle size={13} />
          Confirm all ({pendingCount})
        </button>
        <button
          className="cd-bulk-btn reject"
          onClick={() => handleAllActions(msg.id, "rejected")}
        >
          <XCircle size={13} />
          Reject all
        </button>
      </div>
    );
  }

  /* ---------- Main render ---------- */

  return (
    <>
      {/* Overlay backdrop */}
      {open && <div className="cd-overlay" onClick={onClose} />}

      {/* Drawer */}
      <div className={`cd-drawer ${open ? "cd-drawer-open" : ""}`}>
        {/* Header */}
        <div className="cd-header">
          {view === "history" ? (
            <button
              className="cd-header-btn"
              onClick={() => setView("chat")}
            >
              <ChevronLeft size={16} />
            </button>
          ) : null}

          <div className="cd-header-title">
            {view === "history" ? (
              <span>Conversations</span>
            ) : (
              <>
                <Sparkles size={14} />
                <span>AI Assistant</span>
              </>
            )}
          </div>

          <div className="cd-header-meta">
          </div>

          <div className="cd-header-actions">
            {view === "chat" && (
              <>
                <button
                  className="cd-header-btn"
                  onClick={() => setView("history")}
                  title="History"
                >
                  <MessageCircle size={15} />
                </button>
                <button
                  className="cd-header-btn"
                  onClick={createConversation}
                  title="New conversation"
                >
                  <Plus size={15} />
                </button>
              </>
            )}
            <button
              className="cd-header-btn"
              onClick={onClose}
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>


        {/* Body */}
        <div className="cd-body">
          {view === "history" ? (
            /* Conversation list */
            <div className="cd-conv-list">
              {loadingConvs && (
                <div className="cd-loading">Loading...</div>
              )}
              {!loadingConvs && conversations.length === 0 && (
                <div className="cd-empty-state">
                  <p>No conversations yet</p>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={createConversation}
                  >
                    Start a conversation
                  </button>
                </div>
              )}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`cd-conv-item ${activeConvId === conv.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveConvId(conv.id);
                    setView("chat");
                  }}
                >
                  <div className="cd-conv-title">{conv.title}</div>
                  <div className="cd-conv-date">
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </div>
                  <button
                    className="cd-conv-delete"
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
              {messages.length === 0 && !streaming && !uploading && (
                <div className="cd-welcome">
                  <div className="cd-welcome-icon">
                    <Sparkles size={24} />
                  </div>
                  <h3>AI Assistant</h3>
                  <p>
                    I can help you manage your roadmap — ask questions,
                    create cards, or upload a file to import features.
                  </p>
                  <div className="cd-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        className="cd-suggestion-chip"
                        onClick={() => handleSuggestionClick(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="cd-messages">
                {messages.map((msg) => (
                  <div key={msg.id} className={`cd-msg ${msg.role}`}>
                    {msg.role === "assistant" && (
                      <div className="cd-msg-avatar">
                        <Sparkles size={12} />
                      </div>
                    )}
                    <div className="cd-msg-content">
                      {msg.isUpload ? (
                        <div className="cd-upload-msg">
                          <FileText size={14} />
                          <span>{msg.fileName || msg.content}</span>
                        </div>
                      ) : (
                        <div className="cd-msg-text">{msg.content}</div>
                      )}
                      {msg.actions && msg.actions.length > 0 && (
                        <>
                          {renderBulkActionButtons(msg)}
                          <div className="cd-actions-list">
                            {msg.actions.map(renderAction)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {/* Upload indicator */}
                {uploading && (
                  <div className="cd-msg assistant">
                    <div className="cd-msg-avatar">
                      <Sparkles size={12} />
                    </div>
                    <div className="cd-msg-content">
                      <div className="cd-msg-text">
                        <span className="cd-typing">
                          <Loader size={14} className="cd-spinning" />
                          Analyzing file and extracting features...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Streaming indicator */}
                {streaming && (
                  <div className="cd-msg assistant">
                    <div className="cd-msg-avatar">
                      <Sparkles size={12} />
                    </div>
                    <div className="cd-msg-content">
                      <div className="cd-msg-text">
                        {streamingText || (
                          <span className="cd-typing">
                            <Loader size={14} className="cd-spinning" />
                            Thinking...
                          </span>
                        )}
                      </div>
                      {pendingActions.length > 0 && (
                        <div className="cd-actions-list">
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
          <div className="cd-input-area">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="cd-file-input-hidden"
              onChange={handleFileSelect}
              accept=".csv,.tsv,.txt,.md,.json,.xml,.xlsx,.xls,.pdf,.doc,.docx,.rtf"
            />
            <div className="cd-input-wrap">
              <button
                className="cd-attach-btn"
                onClick={handleAttachClick}
                disabled={uploading || streaming}
                title="Upload file to import features"
              >
                <Paperclip size={15} />
              </button>
              <textarea
                ref={textareaRef}
                className="cd-input"
                placeholder="Ask anything about your roadmap..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={streaming || uploading}
              />
              <button
                className="cd-send-btn"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming || uploading}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
