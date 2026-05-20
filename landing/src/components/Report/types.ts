import type { Store } from "@sniffy/scraper/schemas";

// Phase 4 — the scope a Report needs to call /api/v1/aso/history for any of
// its keywords. The paid /diagnose response carries everything else
// (sniffId, historySignature), but the original request's store/country/
// appId aren't echoed back, so the parent (HomeView) threads them in.
export interface ReportScope {
  store: Store;
  country: string;
  appId: string;
}
