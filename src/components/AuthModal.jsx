import { useState } from "react";
import { X, Mail, Lock, ShieldAlert } from "lucide-react";
import db from "../services/db";

export default function AuthModal({ isOpen, onClose }) {
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setIsLoading(true);

    try {
      if (authMode === "login") {
        await db.loginWithEmail(email, password);
      } else {
        await db.registerWithEmail(email, password);
      }
      onClose();
    } catch (err) {
      console.error("Auth error:", err);
      // Friendly messages for Firebase errors
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setErrorMsg("Invalid email or password.");
      } else if (err.code === "auth/email-already-in-use") {
        setErrorMsg("This email is already registered.");
      } else if (err.code === "auth/weak-password") {
        setErrorMsg("Password should be at least 6 characters.");
      } else {
        setErrorMsg(err.message || "An authentication error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg("");
    setIsLoading(true);
    try {
      await db.loginWithGoogle();
      onClose();
    } catch (err) {
      console.error("Google sign in error:", err);
      if (err.code === "auth/unauthorized-domain") {
        setErrorMsg("This domain is not authorized for Google Sign-in. Please contact the administrator.");
      } else {
        setErrorMsg(err.message || "Failed to sign in with Google.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "16px"
      }}
      onClick={onClose}
    >
      <div 
        className="glass-panel" 
        style={{ 
          maxWidth: "400px", 
          width: "100%", 
          padding: "28px", 
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: "20px"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          style={{
            position: "absolute",
            right: "16px",
            top: "16px",
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            cursor: "pointer",
            padding: "4px"
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <h3 style={{ fontSize: "20px", fontWeight: "800", margin: "0 0 6px 0" }}>
            {authMode === "login" ? "Coordinator Sign In" : "Request Access"}
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
            {authMode === "login" 
              ? "Access tournament scoring and management tools."
              : "Register your thrower email to request coordinator access."}
          </p>
        </div>

        {/* Google Sign In Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            padding: "10px 16px",
            borderRadius: "var(--radius-sm)",
            fontSize: "14px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.2s"
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" style={{ display: "block" }}>
            <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z" />
            <path fill="#4285F4" d="M16.04 15.345c-1.077.733-2.455 1.164-4.04 1.164-3.555 0-6.56-2.455-7.636-5.745L2.338 13.88c1.958 3.951 6.03 6.65 10.76 6.65 2.945 0 5.626-1.018 7.643-2.773l-4.7-3.412z" />
            <path fill="#FBBC05" d="M4.364 10.764a7.042 7.042 0 0 1 0-2.528L2.338 5.12a11.97 11.97 0 0 0 0 8.76l2.026-3.116z" />
            <path fill="#34A853" d="M22.91 12c0-.8-.073-1.573-.208-2.318H12v4.545h6.127c-.264 1.418-1.064 2.618-2.264 3.42l4.7 3.412C20.627 18.982 22.91 15.773 22.91 12z" />
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }}></div>
          <span style={{ fontSize: "11px", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: "600", letterSpacing: "0.5px" }}>or</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }}></div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)" }}>Email Address</label>
            <div style={{ position: "relative" }}>
              <input
                type="email"
                className="form-control"
                style={{ paddingLeft: "36px", width: "100%" }}
                placeholder="thrower@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
              <Mail size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", opacity: 0.7 }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)" }}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type="password"
                className="form-control"
                style={{ paddingLeft: "36px", width: "100%" }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={isLoading}
              />
              <Lock size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", opacity: 0.7 }} />
            </div>
          </div>

          {errorMsg && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center", color: "var(--danger-color)", fontSize: "12px", fontWeight: "500", marginTop: "4px" }}>
              <ShieldAlert size={14} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", padding: "10px", marginTop: "6px" }}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : (authMode === "login" ? "Sign In" : "Submit Access Request")}
          </button>
        </form>

        {/* Footer Toggle */}
        <div style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
          {authMode === "login" ? (
            <>
              Need coordinator access?{" "}
              <button 
                type="button"
                onClick={() => { setAuthMode("register"); setErrorMsg(""); }}
                style={{ background: "none", border: "none", color: "var(--accent-color)", fontWeight: "600", cursor: "pointer", padding: 0 }}
              >
                Request Access
              </button>
            </>
          ) : (
            <>
              Already requested access?{" "}
              <button 
                type="button"
                onClick={() => { setAuthMode("login"); setErrorMsg(""); }}
                style={{ background: "none", border: "none", color: "var(--accent-color)", fontWeight: "600", cursor: "pointer", padding: 0 }}
              >
                Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
