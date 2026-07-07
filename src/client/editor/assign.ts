export function computeDrop(current: string[], pointId: string, toIndex: number): string[] {
  const without = current.filter((id) => id !== pointId);
  const clamped = Math.max(0, Math.min(toIndex, without.length));
  return [...without.slice(0, clamped), pointId, ...without.slice(clamped)];
}
