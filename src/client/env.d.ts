interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY: string;
  readonly VITE_GOOGLE_MAPS_MAP_ID: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
