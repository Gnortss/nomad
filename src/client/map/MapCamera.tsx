import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import type { TripDetail } from "../lib/types";

// Sets the initial camera once per mount (imperatively — the Map itself stays
// uncontrolled and is never remounted): fit bounds to the trip's points if any,
// otherwise try geolocation; on deny/timeout the EUROPE default in MapCanvas
// is already showing. Never re-fits on later data changes.
export function MapCamera({ detail }: { detail: TripDetail }) {
  const map = useMap();
  const didInit = useRef(false);

  useEffect(() => {
    if (!map || didInit.current || typeof google === "undefined") return;
    didInit.current = true;
    const points = detail.points;
    if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng });
      map.setZoom(11); // fitBounds on a single point over-zooms
    } else if (points.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng });
      map.fitBounds(bounds, 60);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => map.moveCamera({ center: { lat: pos.coords.latitude, lng: pos.coords.longitude }, zoom: 8 }),
        () => {}, // denied/unavailable → keep the Europe default
        { timeout: 5000, maximumAge: 600_000 },
      );
    }
  }, [map, detail.points]);

  return null;
}
