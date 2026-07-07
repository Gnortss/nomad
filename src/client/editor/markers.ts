export function markerStyle(input: { groupColor: string; bookingStatus: string; focused: boolean; dimmed: boolean }) {
  const { groupColor, bookingStatus, focused, dimmed } = input;
  let ringStyle: "dashed" | "solid" = "solid";
  let ringWidth = 1.5;
  let opacity = 1;
  let showCheck = false;
  if (bookingStatus === "idea") { ringStyle = "dashed"; ringWidth = 1.5; opacity = 0.88; }
  else if (bookingStatus === "to_book") { ringStyle = "solid"; ringWidth = 1.5; opacity = 1; }
  else if (bookingStatus === "booked") { ringStyle = "solid"; ringWidth = 2; opacity = 1; showCheck = true; }

  let scale = 1;
  let grayscale = 0;
  if (dimmed) { opacity = 0.32; grayscale = 0.6; }   // dim overrides status opacity
  else if (focused) { scale = 1.12; }

  return { fill: groupColor, ringStyle, ringWidth, opacity, showCheck, scale, grayscale };
}
