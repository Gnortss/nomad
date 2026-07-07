import { APIProvider, Map } from "@vis.gl/react-google-maps";

const ICELAND = { lat: 64.9631, lng: -19.0208 };

export function MapCanvas() {
  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}>
      <Map
        mapId={import.meta.env.VITE_GOOGLE_MAPS_MAP_ID}
        defaultCenter={ICELAND}
        defaultZoom={6}
        gestureHandling="greedy"
        disableDefaultUI
        style={{ width: "100%", height: "100%" }}
      />
    </APIProvider>
  );
}
