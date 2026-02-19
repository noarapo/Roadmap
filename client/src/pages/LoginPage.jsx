import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { login, signup, googleLogin, getGoogleClientId } from "../services/api";
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

  const [googleClientId, setGoogleClientId] = useState(null);
  const [googleError, setGoogleError] = useState("");
  const googleBtnRef = useRef(null);

  function handleAuthSuccess(data) {
    localStorage.setItem("token", data.token);
    const userData = {
      ...data.user,
      lastRoadmapId: data.user.last_roadmap_id,
    };
    localStorage.setItem("user", JSON.stringify(userData));
    setCurrentUser(userData);
    return userData;
  }

  // Handle Google credential response
  const handleGoogleResponse = useCallback(async (response) => {
    setGoogleError("");
    try {
      const data = await googleLogin(response.credential);
      const userData = handleAuthSuccess(data);
      if (data.is_new_user) {
        navigate("/onboarding", { replace: true });
      } else {
        const dest = userData.lastRoadmapId ? `/roadmap/${userData.lastRoadmapId}` : redirectTo;
        navigate(dest, { replace: true });
      }
    } catch (err) {
      setGoogleError(err.message || "Google sign-in failed");
    }
  }, [navigate, redirectTo, setCurrentUser]);

  // Fetch Google Client ID and initialize Google Sign-In
  useEffect(() => {
    getGoogleClientId()
      .then((data) => {
        if (data.clientId) {
          setGoogleClientId(data.clientId);
        }
      })
      .catch(() => {});
  }, []);

  // Render Google button when client ID is available and GSI script is loaded
  useEffect(() => {
    if (!googleClientId || !googleBtnRef.current) return;

    function tryRender() {
      if (window.google && window.google.accounts) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleResponse,
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: "outline",
          size: "large",
          width: "100%",
          text: "continue_with",
        });
        return true;
      }
      return false;
    }

    if (!tryRender()) {
      // GSI script not loaded yet — poll briefly
      const interval = setInterval(() => {
        if (tryRender()) clearInterval(interval);
      }, 200);
      return () => clearInterval(interval);
    }
  }, [googleClientId, handleGoogleResponse, isSignup]);

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
      const userData = handleAuthSuccess(data);
      // Go to last roadmap if available, otherwise use redirect target
      const dest = userData.lastRoadmapId ? `/roadmap/${userData.lastRoadmapId}` : redirectTo;
      navigate(dest, { replace: true });
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
      const userData = handleAuthSuccess(data);
      if (data.is_new_user) {
        navigate("/onboarding", { replace: true });
      } else {
        const dest = userData.lastRoadmapId ? `/roadmap/${userData.lastRoadmapId}` : "/roadmaps";
        navigate(dest, { replace: true });
      }
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

        {/* Google Sign-In Button */}
        {googleClientId && (
          <>
            <div ref={googleBtnRef} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
            {googleError && (
              <div className="form-error" style={{ textAlign: "center" }}>
                {googleError}
              </div>
            )}
            <div className="auth-divider">or</div>
          </>
        )}

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
