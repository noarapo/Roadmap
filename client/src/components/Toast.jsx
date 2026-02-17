import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

const ToastContext = createContext(null);

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    /* Mark toast as exiting to trigger fade-out animation */
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    /* Remove from DOM after animation completes */
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const showToast = useCallback(
    (message, type = "info") => {
      const id = ++toastIdCounter;
      setToasts((prev) => [...prev, { id, message, type, exiting: false }]);

      /* Auto-dismiss after 3.5 seconds */
      timersRef.current[id] = setTimeout(() => {
        removeToast(id);
        delete timersRef.current[id];
      }, 3500);

      return id;
    },
    [removeToast]
  );

  const handleDismiss = useCallback(
    (id) => {
      if (timersRef.current[id]) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
      removeToast(id);
    },
    [removeToast]
  );

  /* Clean up timers on unmount */
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICON_MAP = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

function ToastItem({ toast, onDismiss }) {
  const Icon = ICON_MAP[toast.type] || ICON_MAP.info;

  return (
    <div
      className={`toast toast-${toast.type}${toast.exiting ? " toast-exit" : ""}`}
      role="alert"
    >
      <Icon size={16} className="toast-icon" />
      <span className="toast-message">{toast.message}</span>
      <button
        className="toast-dismiss"
        onClick={() => onDismiss(toast.id)}
        type="button"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
