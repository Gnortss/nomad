export function formatDistance(distanceM: number): string {
  return `${Math.round(distanceM / 1000)} km`;
}

export function formatDuration(durationS: number): string {
  const totalMin = Math.round(durationS / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0 && durationS > 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function formatCost(estCost: number | null, costBasis: string | null, currency: string): string {
  if (estCost == null) return "—";
  if (estCost === 0) return "Free";
  const sym = CURRENCY_SYMBOL[currency] ?? currency + " ";
  const amount = `${sym}${estCost}`;
  if (costBasis === "per_night") return `${amount} / night`;
  if (costBasis === "per_person") return `${amount} / person`;
  return amount;
}

export const TYPE_ICON: Record<string, string> = { camp: "⛺", wildcamp: "🏕", hostel: "🛏", hotel: "🏨", poi: "📍", fuel: "⛽", food: "🍽", viewpoint: "🌄", activity: "🥾", other: "⬡" };

export function endpointLabel(index: number, count: number): "START" | "END" | "" {
  if (index === 0) return "START";
  if (index === count - 1) return "END";
  return "";
}
