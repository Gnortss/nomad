import { signInWithGoogle } from "../lib/auth";

export function Login() {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
      <div style={{ maxWidth: 420, padding: 24 }}>
        <div className="ovp" style={{ fontWeight: 800, letterSpacing: ".06em", fontSize: 20 }}>▮ ROADLINE</div>
        <h1 style={{ fontSize: 28, marginTop: 16 }}>Plan the drive. Not just the destination.</h1>
        <button
          onClick={signInWithGoogle}
          style={{ marginTop: 20, height: 44, padding: "0 18px", background: "var(--lupine)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}
