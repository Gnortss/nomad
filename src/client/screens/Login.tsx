import { signInWithGoogle } from "../lib/auth";
import { contour } from "../styles/ui";

export function Login() {
  return (
    <div style={{ height: "100%", position: "relative", overflow: "hidden", background: "var(--basalt)" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, ...contour("82% -12%", 48) }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, ...contour("6% 112%", 60) }} />
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
        <path d="M-40 700 Q300 620 560 660 Q900 710 1180 580 Q1350 500 1480 540" fill="none" stroke="#5B44C9" strokeWidth={3} strokeDasharray="1 13" strokeLinecap="round" opacity={0.85} />
        <circle cx={560} cy={660} r={6} fill="#5B44C9" />
        <circle cx={1180} cy={580} r={6} fill="#E39A0C" />
      </svg>
      <div style={{ position: "relative", maxWidth: 560, padding: "0 40px", top: "18%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span aria-hidden style={{ width: 12, height: 12, background: "var(--lupine)", borderRadius: 4 }} />
          <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".14em", fontSize: 20, color: "#ECF0F0" }}>NOMAD</span>
        </div>
        <h1 className="ovp" style={{ margin: "38px 0 0", fontWeight: 800, fontSize: 40, lineHeight: 1.12, color: "#ECF0F0" }}>
          Plan the drive.<br />Not just the destination.
        </h1>
        <div style={{ marginTop: 14, fontSize: 14.5, color: "#B9C6C3", lineHeight: 1.55, maxWidth: 420 }}>
          Multi-day road trips on a map — days, stops and routes, planned with an AI copilot.
        </div>
        <button onClick={signInWithGoogle}
          style={{ marginTop: 30, height: 46, padding: "0 20px", background: "#ECF0F0", color: "var(--basalt)", border: "none", borderRadius: 11, fontWeight: 700, fontSize: 14.5, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 26px rgba(0,0,0,.35)" }}>
          <span aria-hidden style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", border: "1px solid rgba(30,42,44,.15)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 12, color: "#4285F4" }}>G</span>
          Continue with Google
        </button>
      </div>
      <div className="mono" style={{ position: "absolute", left: 40, bottom: 26, fontSize: 10.5, color: "#6E8380", letterSpacing: ".08em" }}>TERMS · PRIVACY</div>
    </div>
  );
}
