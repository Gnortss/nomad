export function rewritePositions(pointIds: string[]): Array<{ pointId: string; position: number }> {
  const seen = new Set<string>();
  const out: Array<{ pointId: string; position: number }> = [];
  for (const pointId of pointIds) {
    if (seen.has(pointId)) continue;
    seen.add(pointId);
    out.push({ pointId, position: out.length });
  }
  return out;
}
