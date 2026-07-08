import { BedSingle, Footprints, Fuel, Hexagon, Hotel, MapPin, Mountain, PlugZap, Tent, TentTree, Utensils, type LucideIcon } from "lucide-react";

const TYPE_ICONS: Record<string, LucideIcon> = {
  camp: Tent, wildcamp: TentTree, hostel: BedSingle, hotel: Hotel, poi: MapPin,
  fuel: Fuel, charging: PlugZap, food: Utensils, viewpoint: Mountain, activity: Footprints, other: Hexagon,
};

export function TypeIcon({ type, size = 13, color = "currentColor" }: { type: string; size?: number; color?: string }) {
  const Icon = TYPE_ICONS[type] ?? MapPin;
  return <Icon size={size} color={color} strokeWidth={2} aria-hidden />;
}
