import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  extractSubtitle,
  fetchStorefrontPage,
} from "../../../src/providers/apple/storefront-page.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Minimal but representative apps.apple.com page. The shoebox value is a
// stringified AMP-API JSON response — `&` is left literal because <script>
// bodies are not HTML-entity-decoded by the browser.
function makePage(opts: {
  shoeboxSubtitle?: string | null; // null = present-but-empty, undefined = drop the key
  domSubtitle?: string;
}): string {
  const shoebox =
    opts.shoeboxSubtitle === undefined
      ? null
      : {
          "https://amp-api.apps.apple.com/v1/catalog/us/apps/6762223327":
            JSON.stringify({
              d: [
                {
                  id: "6762223327",
                  type: "apps",
                  attributes: {
                    name: "Tally: Everything Pickleball",
                    ...(opts.shoeboxSubtitle === null
                      ? {}
                      : { subtitle: opts.shoeboxSubtitle }),
                    sellerName: "Vincent Theo Roque",
                  },
                },
              ],
            }),
        };
  const shoeboxScript = shoebox
    ? `<script id="shoebox-media-api-cache-apps" type="fastboot/shoebox">${JSON.stringify(shoebox)}</script>`
    : "";
  const domBlock =
    opts.domSubtitle !== undefined
      ? `<h2 class="app-header__title product-header__subtitle product-header__subtitle--app">${opts.domSubtitle}</h2>`
      : "";
  return `<!doctype html><html><head><title>App</title></head><body>${domBlock}${shoeboxScript}</body></html>`;
}

function makeSerializedPage(opts: {
  subtitle?: string;
  title?: string;
  domSubtitle?: string;
}): string {
  const payload = {
    data: [
      {
        data: {
          lockup: {
            title: opts.title ?? "Tally: Everything Pickleball",
            ...(opts.subtitle !== undefined ? { subtitle: opts.subtitle } : {}),
          },
        },
      },
    ],
  };
  const script = `<script type="application/json" id="serialized-server-data">${JSON.stringify(payload)}</script>`;
  const dom =
    opts.domSubtitle !== undefined
      ? `<p class="subtitle svelte-kps97o">${opts.domSubtitle}</p>`
      : "";
  return `<!doctype html><html><body>${dom}${script}</body></html>`;
}

describe("extractSubtitle — Svelte serialized-server-data", () => {
  it("prefers serialized-server-data lockup over both shoebox and DOM", () => {
    const html = makeSerializedPage({
      subtitle: "Scoring, drills & overlays",
      domSubtitle: "ignored",
    });
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "Scoring, drills & overlays",
      source: "serialized-data",
    });
  });

  it("walks deeply nested lockup objects", () => {
    const payload = {
      x: {
        y: {
          z: [
            {
              lockup: { title: "X", subtitle: "Nested subtitle" },
            },
          ],
        },
      },
    };
    const html = `<script type="application/json" id="serialized-server-data">${JSON.stringify(payload)}</script>`;
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "Nested subtitle",
      source: "serialized-data",
    });
  });

  it("falls through to DOM when serialized data has no subtitle", () => {
    const html = makeSerializedPage({
      domSubtitle: "DOM only",
      // no subtitle in serialized payload
    });
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "DOM only",
      source: "dom",
    });
  });

  it("matches the new Svelte <p class=\"subtitle svelte-xxx\"> DOM selector", () => {
    const html =
      '<p class="subtitle svelte-abcdef">Track every match</p>';
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "Track every match",
      source: "dom",
    });
  });
});

describe("extractSubtitle", () => {
  it("prefers the shoebox subtitle over the DOM subtitle", () => {
    const html = makePage({
      shoeboxSubtitle: "Scoring, drills & overlays",
      domSubtitle: "Old subtitle from DOM",
    });
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "Scoring, drills & overlays",
      source: "shoebox",
    });
  });

  it("falls back to the DOM h2 when shoebox JSON has no subtitle", () => {
    const html = makePage({
      shoeboxSubtitle: null,
      domSubtitle: "Scoring, drills &amp; overlays",
    });
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "Scoring, drills & overlays",
      source: "dom",
    });
  });

  it("falls back to the DOM h2 when the shoebox script is missing", () => {
    const html = makePage({ domSubtitle: "Track every match" });
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "Track every match",
      source: "dom",
    });
  });

  it("returns no subtitle when both paths miss", () => {
    const html = "<!doctype html><html><body>not an app page</body></html>";
    expect(extractSubtitle(html)).toEqual({});
  });

  it("ignores empty-string shoebox subtitles and falls through", () => {
    const html = makePage({ shoeboxSubtitle: "", domSubtitle: "From DOM" });
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "From DOM",
      source: "dom",
    });
  });

  it("survives malformed shoebox JSON without throwing", () => {
    const html = `
      <h2 class="product-header__subtitle">DOM Subtitle</h2>
      <script id="shoebox-media-api-cache-apps" type="fastboot/shoebox">{not json}</script>
    `;
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "DOM Subtitle",
      source: "dom",
    });
  });

  it("handles a shoebox whose inner value is already an object (not a JSON string)", () => {
    // Defensive: some Apple pages embed object-shaped values directly.
    const innerObject = {
      d: [{ attributes: { subtitle: "Direct object subtitle" } }],
    };
    const shoebox = {
      "https://amp-api.apps.apple.com/v1/catalog/us/apps/1": innerObject,
    };
    const html = `<script id="shoebox-media-api-cache-apps" type="fastboot/shoebox">${JSON.stringify(shoebox)}</script>`;
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "Direct object subtitle",
      source: "shoebox",
    });
  });

  it("strips inner tags from the DOM h2 text", () => {
    const html =
      '<h2 class="product-header__subtitle">Built for <span>fans</span></h2>';
    expect(extractSubtitle(html)).toMatchObject({
      subtitle: "Built for fans",
      source: "dom",
    });
  });
});

describe("fetchStorefrontPage", () => {
  it("returns the live subtitle when the page is served", async () => {
    server.use(
      http.get(
        "https://apps.apple.com/us/app/id6762223327",
        () =>
          new HttpResponse(
            makePage({ shoeboxSubtitle: "Scoring, drills & overlays" }),
            { headers: { "content-type": "text/html" } },
          ),
      ),
    );
    const res = await fetchStorefrontPage({
      appId: "6762223327",
      country: "US",
    });
    expect(res).toMatchObject({
      subtitle: "Scoring, drills & overlays",
      source: "shoebox",
      provenance: "live",
    });
    expect("scrapedAt" in res ? res.scrapedAt : null).toBeTruthy();
  });

  it("normalizes uppercase country codes to lowercase URLs", async () => {
    let capturedUrl = "";
    server.use(
      http.get("https://apps.apple.com/:country/app/:idPath", ({ request }) => {
        capturedUrl = new URL(request.url).pathname;
        return new HttpResponse(
          makePage({ shoeboxSubtitle: "OK" }),
          { headers: { "content-type": "text/html" } },
        );
      }),
    );
    await fetchStorefrontPage({ appId: "1", country: "JP" });
    expect(capturedUrl).toBe("/jp/app/id1");
  });

  it("returns rate_limited on HTTP 429", async () => {
    server.use(
      http.get(
        "https://apps.apple.com/us/app/id1",
        () => new HttpResponse(null, { status: 429 }),
      ),
    );
    expect(await fetchStorefrontPage({ appId: "1", country: "US" })).toEqual({
      error: "rate_limited",
    });
  });

  it("returns not_found on HTTP 404", async () => {
    server.use(
      http.get(
        "https://apps.apple.com/us/app/id1",
        () => new HttpResponse(null, { status: 404 }),
      ),
    );
    expect(await fetchStorefrontPage({ appId: "1", country: "US" })).toEqual({
      error: "not_found",
    });
  });

  it("returns network_error on a 5xx response", async () => {
    server.use(
      http.get(
        "https://apps.apple.com/us/app/id1",
        () => new HttpResponse(null, { status: 502 }),
      ),
    );
    expect(await fetchStorefrontPage({ appId: "1", country: "US" })).toEqual({
      error: "network_error",
    });
  });

  it("returns no subtitle when the page renders but neither selector matches", async () => {
    server.use(
      http.get(
        "https://apps.apple.com/us/app/id1",
        () =>
          new HttpResponse("<!doctype html><html><body>nope</body></html>", {
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    const res = await fetchStorefrontPage({ appId: "1", country: "US" });
    expect(res).not.toHaveProperty("error");
    expect(res).not.toHaveProperty("subtitle");
    expect("provenance" in res ? res.provenance : null).toBe("live");
    expect("scrapedAt" in res ? typeof res.scrapedAt : "").toBe("string");
  });
});
