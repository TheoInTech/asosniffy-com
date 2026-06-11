import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  WebDiscoverability as WebDiscoverabilitySchema,
  type WebDiscoverability as WebDiscoverabilityType,
  type DiagnosePaidResponse,
} from "@sniffy/scraper/schemas";
import { WebDiscoverabilityCard } from "./WebDiscoverability";

function makeReport(
  audit: WebDiscoverabilityType | null,
): DiagnosePaidResponse {
  return { webDiscoverability: audit } as unknown as DiagnosePaidResponse;
}

// Parse through the Zod schema so the fixture is guaranteed to match the
// production contract (scraper/src/schemas/diagnose.ts).
const baseAudit = WebDiscoverabilitySchema.parse({
  url: "https://example.com",
  smartAppBanner: { present: true, appId: "1234567890", hasAppArgument: false },
  appSchema: {
    present: true,
    type: "SoftwareApplication",
    missingRequiredFields: ["operatingSystem", "offers"],
    aggregateRatingValue: 4.8,
  },
  universalLinks: { present: true, valid: true, bundleIdListed: true },
  androidAppLinks: { present: false },
  aiCrawlerAccess: {
    robotsTxtPresent: true,
    gptBot: "allowed",
    perplexityBot: "blocked",
    googleExtended: "allowed",
  },
  openGraph: { title: true, description: true, image: false },
  ratingDrift: { schemaValue: 4.8, storeValue: 4.3, drift: 0.5 },
  checkedAt: "2026-06-09T12:00:00Z",
  provenance: "live",
});

describe("WebDiscoverabilityCard", () => {
  it("renders nothing when webDiscoverability is null", () => {
    const { container } = render(
      <WebDiscoverabilityCard report={makeReport(null)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a checklist row for each plumbing fact", () => {
    render(<WebDiscoverabilityCard report={makeReport(baseAudit)} />);
    expect(screen.getByText("Smart App Banner")).toBeInTheDocument();
    expect(screen.getByText(/App schema/)).toBeInTheDocument();
    expect(screen.getByText(/Universal Links/)).toBeInTheDocument();
    expect(screen.getByText(/Android App Links/)).toBeInTheDocument();
    expect(screen.getByText(/Open Graph/)).toBeInTheDocument();
  });

  it("lists missingRequiredFields when the app schema is present", () => {
    render(<WebDiscoverabilityCard report={makeReport(baseAudit)} />);
    expect(screen.getByText(/operatingSystem, offers/)).toBeInTheDocument();
  });

  it("renders the three AI-crawler chips with allowed/blocked state", () => {
    render(<WebDiscoverabilityCard report={makeReport(baseAudit)} />);
    expect(screen.getByText("GPTBot")).toBeInTheDocument();
    expect(screen.getByText("PerplexityBot")).toBeInTheDocument();
    expect(screen.getByText("Google-Extended")).toBeInTheDocument();
    expect(screen.getAllByText("allowed")).toHaveLength(2);
    expect(screen.getAllByText("blocked")).toHaveLength(1);
  });

  it("renders the rating-drift callout when ratingDrift is non-null", () => {
    render(<WebDiscoverabilityCard report={makeReport(baseAudit)} />);
    const callout = screen.getByRole("status");
    expect(callout.textContent).toMatch(/Rating drift/i);
    expect(callout.textContent).toContain("4.8");
    expect(callout.textContent).toContain("4.3");
    expect(callout.textContent).toContain("0.5");
  });

  it("omits the rating-drift callout when ratingDrift is null", () => {
    const audit = WebDiscoverabilitySchema.parse({
      ...baseAudit,
      ratingDrift: null,
    });
    render(<WebDiscoverabilityCard report={makeReport(audit)} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the audited URL in the footer", () => {
    render(<WebDiscoverabilityCard report={makeReport(baseAudit)} />);
    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
  });
});
