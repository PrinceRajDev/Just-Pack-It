// Centralised runtime configuration. Only public values belong here.
// Set VITE_API_URL to the Express backend origin to switch off demo data.
export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "",
  mapTileUrl:
    (import.meta.env.VITE_MAP_TILE_URL as string | undefined) ||
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  imageBaseUrl: (import.meta.env.VITE_IMAGE_BASE_URL as string | undefined) ?? "",
};

/** True while no backend is configured; services fall back to the mock layer. */
export const isDemoMode = !config.apiUrl;
