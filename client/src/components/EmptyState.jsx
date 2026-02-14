import React from "react";

export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}) {
  return (
    <div className="empty-state">
      {Icon && (
        <div className="empty-state-icon">
          <Icon size={48} />
        </div>
      )}

      {title && <div className="empty-state-title">{title}</div>}

      {subtitle && <div className="empty-state-subtitle">{subtitle}</div>}

      {actionLabel && onAction && (
        <button
          className="btn btn-primary"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
