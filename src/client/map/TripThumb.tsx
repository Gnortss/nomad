import { decodePolyline } from "./polyline";

const W = 240, H = 120, PAD = 14;

type LatLng = { lat: number; lng: number };
type XY = { x: number; y: number };

// Equirectangular projection of all vertices (stops + route polylines) into the
// thumbnail viewBox: cos(midLat) corrects longitude spans, uniform scale keeps aspect.
export function projectAll(points: LatLng[], routePolylines: string[]): { dots: XY[]; paths: XY[][] } {
  const decoded = routePolylines.map(decodePolyline);
  const all = [...points, ...decoded.flat()];
  if (all.length === 0) return { dots: [], paths: [] };

  const lats = all.map((p) => p.lat);
  const kx = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180);
  const toPlane = (p: LatLng) => ({ x: p.lng * kx, y: -p.lat });

  const plane = all.map(toPlane);
  const xs = plane.map((p) => p.x), ys = plane.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min(
    spanX > 0 ? (W - 2 * PAD) / spanX : Infinity,
    spanY > 0 ? (H - 2 * PAD) / spanY : Infinity,
  );
  const s = Number.isFinite(scale) ? scale : 1; // single point (or identical points): centered
  const toView = (p: LatLng) => {
    const { x, y } = toPlane(p);
    return { x: Math.round((W / 2 + (x - cx) * s) * 10) / 10, y: Math.round((H / 2 + (y - cy) * s) * 10) / 10 };
  };

  return { dots: points.map(toView), paths: decoded.map((line) => line.map(toView)) };
}

// Night-map postcard: basalt ground, faint contour rings (seeded per trip so
// cards differ), lupine route, glacier stop dots with a sulfur last stop, and
// an optional mono meta chip bottom-right.
export function TripThumb({ points, routePolylines, seed = 0, meta }:
  { points: LatLng[]; routePolylines: string[]; seed?: number; meta?: string }) {
  const { dots, paths } = projectAll(points, routePolylines);
  const ringCx = [200, 30, 120, 240][seed % 4];
  const ringCy = seed % 2 === 0 ? -20 : 140;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trip map preview" style={{ display: "block", width: "100%", height: "auto", borderRadius: 9 }}>
      <rect width={W} height={H} fill="var(--basalt)" />
      {[60, 90, 120].map((r, i) => (
        <circle key={r} data-ring cx={ringCx} cy={ringCy} r={r} fill="none" stroke={`rgba(236,240,240,${0.07 - i * 0.01})`} strokeWidth={1} />
      ))}
      {paths.map((line, i) => (
        <path key={i} d={line.map((p, j) => `${j === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ")}
          fill="none" stroke="var(--lupine)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
      ))}
      {dots.map((d, i) => (
        <circle key={i} data-dot cx={d.x} cy={d.y} r={i === 0 || i === dots.length - 1 ? 4 : 3}
          fill={i === dots.length - 1 && dots.length > 1 ? "#E39A0C" : "#ECF0F0"} />
      ))}
      {meta && (
        <text x={W - 8} y={H - 7} textAnchor="end" fill="#8FA3A0" fontSize={9} letterSpacing=".06em" style={{ fontFamily: "var(--font-mono)" }}>{meta}</text>
      )}
    </svg>
  );
}
