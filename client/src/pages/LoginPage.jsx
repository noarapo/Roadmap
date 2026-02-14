import React, { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSignup = location.pathname === "/signup";

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginErrors, setLoginErrors] = useState({});

  // Signup form state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupErrors, setSignupErrors] = useState({});

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

  function handleLogin(e) {
    e.preventDefault();
    const errors = validateLogin();
    setLoginErrors(errors);
    if (Object.keys(errors).length > 0) return;
    // Simulate login success
    navigate("/workspaces");
  }

  function handleSignup(e) {
    e.preventDefault();
    const errors = validateSignup();
    setSignupErrors(errors);
    if (Object.keys(errors).length > 0) return;
    // Simulate signup success
    navigate("/onboarding");
  }

  function handleGoogleAuth() {
    if (isSignup) {
      navigate("/onboarding");
    } else {
      navigate("/workspaces");
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

            <button type="submit" className="btn btn-primary btn-full">
              Log in
            </button>

            <div className="auth-divider">or</div>

            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={handleGoogleAuth}
            >
              Continue with Google
            </button>

            <div style={{ textAlign: "center" }}>
              <Link to="/forgot-password" style={{ fontSize: "13px" }}>
                Forgot password?
              </Link>
            </div>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignup}>
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

            <button type="submit" className="btn btn-primary btn-full">
              Create account
            </button>

            <div className="auth-divider">or</div>

            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={handleGoogleAuth}
            >
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
