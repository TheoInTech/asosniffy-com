import { recordInvocation, responseHash } from "../../observability/audit.js";
import { recordResponseShape } from "../../observability/shape-hash.js";

// Apple iTunes Customer Reviews RSS.
//
// URL shape:
//   https://itunes.apple.com/{country}/rss/customerreviews/page=N/id={id}/sortby=mostrecent/json
//
// Notes from PLAN.md research (citations in the plan file):
//   • Capped at ~500 reviews total via RSS (10 pages × ~50 reviews).
//   • Unreliable for many apps — some return empty feeds even when the app
//     has public reviews on the App Store. We surface `coverage: "unavailable"`
//     in that case rather than throw.
//   • No auth required, no rate limit documented (we still respect the
//     iTunes 18/min budget via providers/_lib/token-bucket).

const PROVIDER = "apple-reviews-rss";
const USER_AGENT = "ASOSniffy/0.1 (+https://github.com/TheoInTech/asosniffy-com)";

export interface ReviewItem {
  id: string;
  title: string;
  body: string;
  rating: number;
  author: string;
  updatedAt: string; // ISO 8601 when parseable; falls back to the raw RSS string
}

export interface ReviewsRssResult {
  reviews: ReviewItem[];
  coverage: "complete" | "partial" | "unavailable";
  sampleSize: number;
  pagesFetched: number;
}

export type ReviewsRssOutcome =
  | ReviewsRssResult
  | { error: "network_error" }
  | { error: "rate_limited" };

export interface FetchReviewsInput {
  appId: string;
  country: string;
  // Pages 1..10 (Apple caps higher pages at empty). Default 10 walks the
  // whole window; tests / shallow paths may pass 2 to stay cheap.
  maxPages?: number;
}

export async function fetchAppleReviewsRss(
  input: FetchReviewsInput,
): Promise<ReviewsRssOutcome> {
  const maxPages = Math.min(input.maxPages ?? 10, 10);
  const all: ReviewItem[] = [];
  let pagesFetched = 0;
  let hitNetworkError = false;
  let hitRateLimit = false;

  for (let page = 1; page <= maxPages; page++) {
    const url =
      `https://itunes.apple.com/${input.country.toLowerCase()}` +
      `/rss/customerreviews/page=${page}/id=${encodeURIComponent(input.appId)}` +
      `/sortby=mostrecent/json`;
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch {
      recordInvocation({
        provider: PROVIDER,
        endpoint: `/customerreviews?page=${page}`,
        source: "live",
        latencyMs: Date.now() - started,
        bytesIn: 0,
        responseHash: "",
        errorKind: "network_error",
      });
      hitNetworkError = true;
      break;
    }
    if (res.status === 429 || res.status === 403) {
      recordInvocation({
        provider: PROVIDER,
        endpoint: `/customerreviews?page=${page}`,
        source: "live",
        latencyMs: Date.now() - started,
        bytesIn: 0,
        responseHash: "",
        httpStatus: res.status,
        errorKind: "rate_limited",
      });
      hitRateLimit = true;
      break;
    }
    if (!res.ok) {
      recordInvocation({
        provider: PROVIDER,
        endpoint: `/customerreviews?page=${page}`,
        source: "live",
        latencyMs: Date.now() - started,
        bytesIn: 0,
        responseHash: "",
        httpStatus: res.status,
        errorKind: "network_error",
      });
      hitNetworkError = true;
      break;
    }
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      recordInvocation({
        provider: PROVIDER,
        endpoint: `/customerreviews?page=${page}`,
        source: "live",
        latencyMs: Date.now() - started,
        bytesIn: text.length,
        responseHash: "",
        httpStatus: res.status,
        errorKind: "schema_drift",
      });
      hitNetworkError = true;
      break;
    }
    recordInvocation({
      provider: PROVIDER,
      endpoint: `/customerreviews?page=${page}`,
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: text.length,
      responseHash: responseHash(body),
      httpStatus: res.status,
    });
    // Schema-drift tracking. Page 1 is the most stable indicator of feed
    // shape; subsequent pages share structure, so we only record page-1.
    if (page === 1) {
      void recordResponseShape({
        provider: PROVIDER,
        endpoint: "/customerreviews",
        value: body,
      });
    }

    const pageReviews = parsePage(body);
    pagesFetched += 1;
    if (pageReviews.length === 0) {
      // Apple cuts off pagination by returning an empty `entry` array — not
      // an error. Stop walking.
      break;
    }
    all.push(...pageReviews);
    if (pageReviews.length < 25) {
      // Final page typically has < 25 entries (page size is ~50 but the
      // tail is variable). Treat any short page as the last.
      break;
    }
  }

  // Outcome resolution:
  //   - Got reviews + no transient error → complete (we walked until empty)
  //     or partial (we hit a transient error after some pages succeeded).
  //   - No reviews + transient error before any page → return the error.
  //   - No reviews + clean walk → coverage: unavailable. RSS feed is empty.
  if (all.length === 0 && hitNetworkError && pagesFetched === 0) {
    return { error: "network_error" };
  }
  if (all.length === 0 && hitRateLimit && pagesFetched === 0) {
    return { error: "rate_limited" };
  }
  if (all.length === 0) {
    return {
      reviews: [],
      coverage: "unavailable",
      sampleSize: 0,
      pagesFetched,
    };
  }
  return {
    reviews: all,
    coverage: hitNetworkError || hitRateLimit ? "partial" : "complete",
    sampleSize: all.length,
    pagesFetched,
  };
}

// Apple's RSS-as-JSON envelope wraps each field under a `label` key. We
// only consume id/title/content/rating/author/updated, all surfaced via
// the same path. The shape is stable but defensive — schema-drift logs
// will tell us when it changes.
interface RssEntry {
  id?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
  "im:rating"?: { label?: string };
  author?: { name?: { label?: string } };
  updated?: { label?: string };
}

function parsePage(body: unknown): ReviewItem[] {
  if (!body || typeof body !== "object") return [];
  const feed = (body as { feed?: { entry?: unknown } }).feed;
  if (!feed || typeof feed !== "object") return [];
  const entry = feed.entry;
  if (!Array.isArray(entry)) return [];

  // The first entry in Apple's feed is the app itself; reviews start at
  // index 1. Defensive: filter out entries with no rating (the app entry
  // has metadata fields the review entries don't carry).
  return entry
    .filter((e): e is RssEntry => typeof e === "object" && e !== null)
    .map((e) => {
      const rating = parseInt(e["im:rating"]?.label ?? "0", 10);
      if (Number.isNaN(rating) || rating <= 0) return null;
      return {
        id: e.id?.label ?? "",
        title: e.title?.label ?? "",
        body: e.content?.label ?? "",
        rating,
        author: e.author?.name?.label ?? "Unknown",
        updatedAt: e.updated?.label ?? "",
      } satisfies ReviewItem;
    })
    .filter((r): r is ReviewItem => r !== null);
}
