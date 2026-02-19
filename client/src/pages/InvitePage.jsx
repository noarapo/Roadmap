import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { verifyInviteToken, signup } from "../services/api";
import { useStore } from "../hooks/useStore";

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { setCurrentUser } = useStore();

  const [loading, setLoading] = useState(true);
  const [inviteData, setInviteData] = useState(null);
  const [verifyError, setVerifyError] = useState("");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    verifyInviteToken(token)
      .then((data) => {
        setInviteData(data);
      })
      .catch((err) => {
        setVerifyError(err.message || "Invalid invite link");
      })
      .finally(() => setLoading(false));
  }, [token]);

  function validate() {
    const errs = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (!password) errs.password = "Password is required";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters";
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setErrors({});
    try {
      const data = await signup(inviteData.email, password, name, token);
      localStorage.setItem("token", data.token);
      const userData = {
        ...data.user,
        lastRoadmapId: data.user.last_roadmap_id,
      };
      localStorage.setItem("user", JSON.stringify(userData));
      setCurrentUser(userData);
      const dest = userData.lastRoadmapId ? `/roadmap/${userData.lastRoadmapId}` : "/roadmaps";
      navigate(dest, { replace: true });
    } catch (err) {
      setErrors({ form: err.message || "Failed to create account" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">R</div>
          </div>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Verifying invite...
          </p>
        </div>
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">R</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <p className="form-error" style={{ marginBottom: "var(--space-4)" }}>{verifyError}</p>
            <Link to="/login" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">R</div>
        </div>

        <div style={{ textAlign: "center", marginBottom: "var(--space-5)" }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: "var(--space-1)" }}>
            Join {inviteData.workspace_name}
          </p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Create your account to accept the invite
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {errors.form && (
            <div className="form-error" style={{ marginBottom: 12, textAlign: "center" }}>
              {errors.form}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="input"
              value={inviteData.email}
              disabled
            />
          </div>

          <div className="form-group">
            <label className="form-label">Full name</label>
            <input
              type="text"
              className={`input ${errors.name ? "input-error" : ""}`}
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {errors.name && (
              <span className="form-error">{errors.name}</span>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className={`input ${errors.password ? "input-error" : ""}`}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && (
              <span className="form-error">{errors.password}</span>
            )}
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account & join"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "var(--space-4)" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "var(--teal)" }}>Log in</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
