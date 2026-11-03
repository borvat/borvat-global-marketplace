/**
 * Demo catalogue media.
 *
 * The isolated test shop has no supplier feeds, so these are licensed Wikimedia
 * Commons photos used to make the shopping presentation judgeable. They are
 * demonstration imagery for the fixtures, not the products a supplier ships, and
 * every file is credited in `public/demo/ATTRIBUTION.md`.
 */
export const DEMO_MEDIA: Record<string, string> = {
  prd_001: "/demo/prd_001.jpg",
  prd_002: "/demo/prd_002.jpg",
  prd_003: "/demo/prd_003.jpg",
  prd_004: "/demo/prd_004.jpg",
  prd_005: "/demo/prd_005.jpg",
  prd_006: "/demo/prd_006.jpg",
  prd_007: "/demo/prd_007.jpg",
  prd_008: "/demo/prd_008.jpg",
  prd_009: "/demo/prd_009.jpg",
};

export function demoMedia(id: string): string | null {
  return DEMO_MEDIA[id] ?? null;
}
