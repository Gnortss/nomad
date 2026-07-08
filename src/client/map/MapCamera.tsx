import { useEffect, useRef } from "react";
import { useMap } from "@vis.gl/react-google-maps";
import type { TripDetail } from "../lib/types";

// Sets the camera once per mount (imperatively — the Map itself stays
// uncontrolled and is never remounted): fit bounds to the trip's points if any,
// else the trip's stored map center (extracted from the new-trip description),
// else geolocation; on deny/timeout the EUROPE default in MapCanvas is already
// showing. One exception to "never re-fit": a trip that mounted EMPTY re-fits
// once when its first points arrive (the AI kickoff filling in the map).
export function MapCamera({ detail }: { detail: TripDetail }) {
  const map = useMap();
  const didInit = useRef(false);
  const awaitingFirstPoints = useRef(false);

  function fitToPoints(m: google.maps.Map, points: TripDetail["points"]) {
    if (points.length === 1) {
      m.setCenter({ lat: points[0].lat, lng: points[0].lng });
      m.setZoom(11); // fitBounds on a single point over-zooms
    } else {
      const bounds = new google.maps.LatLngBounds();
      for (const p of points) bounds.extend({ lat: p.lat, lng: p.lng });
      m.fitBounds(bounds, 60);
    }
  }

  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    if (didInit.current) {
      if (awaitingFirstPoints.current && detail.points.length > 0) {
        awaitingFirstPoints.current = false;
        fitToPoints(map, detail.points);
      }
      return;
    }
    didInit.current = true;
    const { points, trip } = detail;
    if (points.length > 0) {
      fitToPoints(map, points);
    } else {
      awaitingFirstPoints.current = true;
      if (trip.mapLat != null && trip.mapLng != null) {
        map.moveCamera({ center: { lat: trip.mapLat, lng: trip.mapLng }, zoom: 7 });
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => map.moveCamera({ center: { lat: pos.coords.latitude, lng: pos.coords.longitude }, zoom: 8 }),
          () => {}, // denied/unavailable → keep the Europe default
          { timeout: 5000, maximumAge: 600_000 },
        );
      }
    }
  }, [map, detail]);

  return null;
}
