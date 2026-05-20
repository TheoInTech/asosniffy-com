// Typed shim over `google-play-scraper` (no DefinitelyTyped types ship).
//
// We type only the fields we actually consume downstream — the upstream
// library exposes a much larger surface. Anything not declared here is
// intentionally not part of our contract; adding new fields requires
// extending the relevant Pick type below.

import gplayDefault from "google-play-scraper";

// The package ships ESM default export. The default may be a function or
// an object depending on how the bundler resolves it; we tolerate both.
type GplayShape = {
  app: (opts: AppOpts) => Promise<RawApp>;
  search: (opts: SearchOpts) => Promise<RawSearchHit[]>;
  similar: (opts: SimilarOpts) => Promise<RawSearchHit[]>;
  suggest: (opts: SuggestOpts) => Promise<string[]>;
  reviews: (opts: ReviewsOpts) => Promise<RawReviewsResult>;
};

const gplay = gplayDefault as unknown as GplayShape;

export interface AppOpts {
  appId: string;
  lang?: string;
  country?: string;
  throttle?: number;
  requestOptions?: Record<string, unknown>;
}

export interface SearchOpts {
  term: string;
  lang?: string;
  country?: string;
  num?: number;
  fullDetail?: boolean;
  throttle?: number;
  requestOptions?: Record<string, unknown>;
}

export interface SimilarOpts {
  appId: string;
  lang?: string;
  country?: string;
  fullDetail?: boolean;
  throttle?: number;
  requestOptions?: Record<string, unknown>;
}

export interface SuggestOpts {
  term: string;
  lang?: string;
  country?: string;
  throttle?: number;
  requestOptions?: Record<string, unknown>;
}

export interface ReviewsOpts {
  appId: string;
  lang?: string;
  country?: string;
  sort?: number; // 1 NEWEST, 2 RATING, 3 HELPFULNESS (gplay enums)
  num?: number;
  paginate?: boolean;
  nextPaginationToken?: string;
  throttle?: number;
  requestOptions?: Record<string, unknown>;
}

export interface RawReview {
  id?: string;
  userName?: string;
  date?: string;
  score?: number;
  scoreText?: string;
  title?: string;
  text?: string;
  url?: string;
  thumbsUp?: number;
  version?: string;
  replyDate?: string;
  replyText?: string;
}

// gplay.reviews returns either RawReview[] OR { data, nextPaginationToken }
// depending on the `paginate` flag. We accept the union and let callers
// flatten.
export type RawReviewsResult = RawReview[] | {
  data: RawReview[];
  nextPaginationToken?: string;
};

export interface RawApp {
  appId: string;
  url?: string;
  title: string;
  developer: string;
  developerId?: string;
  genre?: string;
  genreId?: string;
  categories?: Array<{ name?: string; id?: string }>;
  description?: string;
  descriptionHTML?: string;
  summary?: string;
  icon?: string;
  screenshots?: string[];
  installs?: string;
  minInstalls?: number;
  maxInstalls?: number;
  score?: number;
  scoreText?: string;
  ratings?: number;
  reviews?: number;
  free?: boolean;
  released?: string;
  updated?: number;
  version?: string;
  contentRating?: string;
}

export interface RawSearchHit {
  appId: string;
  title: string;
  url?: string;
  icon?: string;
  developer: string;
  developerId?: string;
  score?: number;
  scoreText?: string;
  free?: boolean;
  summary?: string;
  price?: number;
  currency?: string;
}

// Injection seam — tests swap the underlying gplay binding so they don't
// hit the live Play Store.
let bound: GplayShape = gplay;

export function setGplayForTests(stub: Partial<GplayShape>): void {
  bound = { ...bound, ...stub } as GplayShape;
}

export function resetGplayForTests(): void {
  bound = gplay;
}

export function getGplay(): GplayShape {
  return bound;
}
