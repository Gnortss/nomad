// Shared "Basecamp" style kit — every recurring recipe (buttons, elevation,
// section headers, popovers, dialog frames) is defined once and reused.
import type { CSSProperties } from "react";

export const E1 = "0 1px 2px rgba(22,33,31,.05)";
export const E2 = "0 1px 2px rgba(22,33,31,.06), 0 8px 22px rgba(22,33,31,.10)";
export const E3 = "0 2px 6px rgba(22,33,31,.08), 0 18px 48px rgba(22,33,31,.18)";

export const BORDER = "1px solid rgba(30,42,44,.12)";
export const FIELD_BORDER = "1px solid rgba(30,42,44,.16)";
export const RULE = "1px solid rgba(30,42,44,.10)";
export const SCRIM = "rgba(22,33,31,.5)";

// 6 fixed group hues; ungrouped falls back to basalt everywhere.
export const GROUP_HUES = ["#C64A3B", "#E39A0C", "#4C7A34", "#2C6E8A", "#5B44C9", "#57676B"];

// rgba() from a #rrggbb hue — used for tinted icon chips and group filter chips.
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Faint contour-ring texture for dark surfaces (5% white).
export function contour(pos: string, step = 46): CSSProperties {
  return {
    backgroundImage: `repeating-radial-gradient(circle at ${pos}, transparent 0 ${step}px, rgba(236,240,240,.05) ${step}px ${step + 1.5}px)`,
  };
}

const btnBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export function btnPrimary(h = 36): CSSProperties {
  return {
    ...btnBase,
    height: h,
    padding: "0 16px",
    background: "var(--lupine)",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontWeight: 700,
    fontSize: 13.5,
    boxShadow: "0 1px 2px rgba(22,33,31,.2), inset 0 1px 0 rgba(255,255,255,.18)",
  };
}

export function btnSecondary(h = 36): CSSProperties {
  return {
    ...btnBase,
    height: h,
    padding: "0 13px",
    background: "#fff",
    color: "var(--ink)",
    border: FIELD_BORDER,
    borderRadius: 9,
    fontWeight: 600,
    fontSize: 13.5,
    boxShadow: E1,
  };
}

// Ghost buttons for dark chrome (top bars).
export function btnGhostDark(h = 31): CSSProperties {
  return {
    ...btnBase,
    height: h,
    padding: "0 11px",
    background: "transparent",
    color: "#ECF0F0",
    border: "1px solid rgba(236,240,240,.28)",
    borderRadius: 8,
    fontWeight: 400,
    fontSize: 12,
  };
}

export const btnQuietDestructive: CSSProperties = {
  ...btnBase,
  padding: 0,
  background: "transparent",
  border: "none",
  color: "var(--brick)",
  fontWeight: 600,
  fontSize: 13,
};

export function btnDestructive(h = 34): CSSProperties {
  return {
    ...btnBase,
    height: h,
    padding: "0 15px",
    background: "var(--brick)",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    fontWeight: 700,
    fontSize: 13,
  };
}

export function field(h = 36): CSSProperties {
  return {
    height: h,
    padding: "0 12px",
    background: "#fff",
    color: "var(--ink)",
    border: FIELD_BORDER,
    borderRadius: 9,
    fontSize: 13,
    fontFamily: "inherit",
    boxShadow: "inset 0 1px 2px rgba(22,33,31,.04)",
  };
}

// Ruled all-caps section header (detail panel, rail headers).
export const sectionHead: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: ".13em",
  color: "var(--slate)",
  marginBottom: 8,
  borderBottom: RULE,
  paddingBottom: 5,
};

export const popover: CSSProperties = {
  background: "#fff",
  border: BORDER,
  borderRadius: 10,
  boxShadow: E3,
  overflow: "hidden",
};

export function dialogCard(w: number): CSSProperties {
  return {
    // Dialogs can mount under dark chrome (TopBar) — never inherit its text color.
    color: "var(--ink)",
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 2px 6px rgba(22,33,31,.1), 0 24px 60px rgba(22,33,31,.22)",
    padding: "22px 24px",
    width: w,
    maxWidth: "92vw",
  };
}

// Dashed affordances: "+ Add link", "Open in Google Maps ↗", "+ New group".
export const dashedAction: CSSProperties = {
  background: "transparent",
  border: "1px dashed rgba(87,103,107,.4)",
  borderRadius: 9,
  padding: "6px 11px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--slate)",
  cursor: "pointer",
};

// Tinted square icon button (dialog close, panel actions).
export function iconBtn(s = 28): CSSProperties {
  return {
    width: s,
    height: s,
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(87,103,107,.10)",
    border: "none",
    borderRadius: 8,
    color: "var(--slate)",
    cursor: "pointer",
  };
}
