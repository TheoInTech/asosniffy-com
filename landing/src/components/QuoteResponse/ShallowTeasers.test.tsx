import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ShallowScan as ShallowScanSchema,
  type ShallowScan,
} from "@sniffy/scraper/schemas";
import { ShallowTeasers } from "./ShallowTeasers";

// Parse through the Zod schema so the fixture is guaranteed to match the
// production contract (scraper/src/schemas/quote.ts).
function makeShallow(overrides: Partial<ShallowScan> = {}): ShallowScan {
  return ShallowScanSchema.parse({
    title: "Court Sniff",
    subtitle: "Track pickleball games",
    primaryCategory: "Sports",
    ratingsSummary: { average: 4.3, count: 812 },
    previewKeyword: {
      keyword: "pickleball",
      rankBucket: "11-30",
      confidence: "medium",
      provenance: "live",
    },
    ...overrides,
  });
}

describe("ShallowTeasers", () => {
  it("renders nothing when all three teaser fields are absent", () => {
    const { container } = render(
      <ShallowTeasers shallowScan={makeShallow()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the rating-band verdict note", () => {
    render(
      <ShallowTeasers
        shallowScan={makeShallow({
          ratingBandVerdict: {
            band: "credible",
            note: "4.3 sits in the credible band — above 4.0, below the 4.5 top cluster.",
          },
        })}
      />,
    );
    expect(
      screen.getByText(
        "4.3 sits in the credible band — above 4.0, below the 4.5 top cluster.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a positive AI mention with model and intent", () => {
    render(
      <ShallowTeasers
        shallowScan={makeShallow({
          aiMention: {
            mentioned: true,
            model: "gpt-4o-mini",
            intent: "pickleball score tracking",
            checkedAt: "2026-06-08T00:00:00Z",
            provenance: "cached",
          },
        })}
      />,
    );
    expect(screen.getByText("named this app")).toBeInTheDocument();
    expect(
      screen.getByText(/for "pickleball score tracking"/),
    ).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
  });

  it("renders a negative AI mention as 'did not name'", () => {
    render(
      <ShallowTeasers
        shallowScan={makeShallow({
          aiMention: {
            mentioned: false,
            model: "gpt-4o-mini",
            intent: "pickleball score tracking",
            checkedAt: "2026-06-08T00:00:00Z",
            provenance: "live",
          },
        })}
      />,
    );
    expect(screen.getByText("did not name this app")).toBeInTheDocument();
  });

  it("renders the three web-plumbing chips", () => {
    render(
      <ShallowTeasers
        shallowScan={makeShallow({
          webPlumbing: {
            smartAppBanner: true,
            appSchema: false,
            deepLinking: true,
          },
        })}
      />,
    );
    expect(screen.getByText(/smart app banner/i)).toBeInTheDocument();
    expect(screen.getByText(/app schema/i)).toBeInTheDocument();
    expect(screen.getByText(/deep linking/i)).toBeInTheDocument();
  });

  it("renders only the teasers that are present", () => {
    render(
      <ShallowTeasers
        shallowScan={makeShallow({
          ratingBandVerdict: { band: "top-cluster", note: "Top cluster." },
          aiMention: null,
          webPlumbing: null,
        })}
      />,
    );
    expect(screen.getByText("Top cluster.")).toBeInTheDocument();
    expect(screen.queryByText(/name this app/i)).toBeNull();
    expect(screen.queryByText(/smart app banner/i)).toBeNull();
  });
});
