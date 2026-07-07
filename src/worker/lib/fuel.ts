export function dayFuelCost(
  distanceM: number,
  lPer100km: number | null | undefined,
  pricePerL: number | null | undefined,
): number | null {
  if (lPer100km == null || pricePerL == null) return null;
  return (distanceM / 1000) * (lPer100km / 100) * pricePerL;
}
