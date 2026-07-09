// Anchored-marker recipe (slide 08): squircle + tail, white casing, real shadow.
// One rule for status everywhere: idea = dashed casing · to book = sulfur corner
// dot · booked = moss check badge. Fill = group hue (basalt when ungrouped).
export function markerStyle(input: { groupColor: string; bookingStatus: string; focused: boolean; dimmed: boolean; selected?: boolean }) {
  const { groupColor, bookingStatus, focused, dimmed, selected = false } = input;

  let size = 32, radius = 10, iconSize = 16, casingWidth = 2.5;
  let halo = false;
  if (selected) { size = 38; radius = 11; iconSize = 19; halo = true; }
  else if (focused) { size = 34; radius = 10; iconSize = 17; }

  let opacity = 1, grayscale = 0;
  if (dimmed && !selected) {
    size = 26; radius = 8; iconSize = 13; casingWidth = 2;
    opacity = 0.32; grayscale = 0.6;
  }

  const casingStyle: "dashed" | "solid" = bookingStatus === "idea" ? "dashed" : "solid";
  const badge: "none" | "toBook" | "booked" =
    dimmed && !selected ? "none" : bookingStatus === "to_book" ? "toBook" : bookingStatus === "booked" ? "booked" : "none";

  return { fill: groupColor, size, radius, iconSize, casingWidth, casingStyle, opacity, grayscale, halo, badge };
}
