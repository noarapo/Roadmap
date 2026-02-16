import React, { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { login, signup } from "../services/api";
import { useStore } from "../hooks/useStore";

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentUser } = useStore();
  const isSignup = location.pathname === "/signup";
  const redirectTo = location.state?.from || "/";

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginErrors, setLoginErrors] = useState({});
  const [loginLoading, setLoginLoading] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupErrors, setSignupErrors] = useState({});
  const [signupLoading, setSignupLoading] = useState(false);

  function validateLogin() {
    const errors = {};
    if (!loginEmail.trim()) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(loginEmail)) errors.email = "Enter a valid email";
    if (!loginPassword) errors.password = "Password is required";
    return errors;
  }

  function validateSignup() {
    const errors = {};
    if (!signupName.trim()) errors.name = "Full name is required";
    if (!signupEmail.trim()) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(signupEmail)) errors.email = "Enter a valid email";
    if (!signupPassword) errors.password = "Password is required";
    else if (signupPassword.length < 8) errors.password = "Password must be at least 8 characters";
    return errors;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const errors = validateLogin();
    setLoginErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoginLoading(true);
    try {
      const data = await login(loginEmail, loginPassword);
      localStorage.setItem("token", data.token);
      const userData = {
        ...data.user,
        lastRoadmapId: data.user.last_roadmap_id,
      };
      localStorage.setItem("user", JSON.stringify(userData));
      setCurrentUser(userData);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setLoginErrors({ form: err.message || "Login failed" });
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    const errors = validateSignup();
    setSignupErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSignupLoading(true);
    try {
      const data = await signup(signupEmail, signupPassword, signupName);
      localStorage.setItem("token", data.token);
      const userData = {
        ...data.user,
        lastRoadmapId: data.user.last_roadmap_id,
      };
      localStorage.setItem("user", JSON.stringify(userData));
      setCurrentUser(userData);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setSignupErrors({ form: err.message || "Signup failed" });
    } finally {
      setSignupLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">R</div>
        </div>

        <div className="auth-tabs">
          <Link
            to="/login"
            className={`auth-tab ${!isSignup ? "active" : ""}`}
            style={{ textDecoration: "none" }}
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className={`auth-tab ${isSignup ? "active" : ""}`}
            style={{ textDecoration: "none" }}
          >
            Sign up
          </Link>
        </div>

        {!isSignup ? (
          <form className="auth-form" onSubmit={handleLogin}>
            {loginErrors.form && (
              <div className="form-error" style={{ marginBottom: 12, textAlign: "center" }}>
                {loginErrors.form}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className={`input ${loginErrors.email ? "input-error" : ""}`}
                placeholder="you@company.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
              {loginErrors.email && (
                <span className="form-error">{loginErrors.email}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className={`input ${loginErrors.password ? "input-error" : ""}`}
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
              {loginErrors.password && (
                <span className="form-error">{loginErrors.password}</span>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loginLoading}>
              {loginLoading ? "Logging in..." : "Log in"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignup}>
            {signupErrors.form && (
              <div className="form-error" style={{ marginBottom: 12, textAlign: "center" }}>
                {signupErrors.form}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Full name</label>
              <input
                type="text"
                className={`input ${signupErrors.name ? "input-error" : ""}`}
                placeholder="Jane Smith"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
              />
              {signupErrors.name && (
                <span className="form-error">{signupErrors.name}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className={`input ${signupErrors.email ? "input-error" : ""}`}
                placeholder="you@company.com"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
              />
              {signupErrors.email && (
                <span className="form-error">{signupErrors.email}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className={`input ${signupErrors.password ? "input-error" : ""}`}
                placeholder="At least 8 characters"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
              />
              {signupErrors.password && (
                <span className="form-error">{signupErrors.password}</span>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={signupLoading}>
              {signupLoading ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
