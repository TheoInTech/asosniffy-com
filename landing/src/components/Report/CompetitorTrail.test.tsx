import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { CompetitorTrail } from "./CompetitorTrail";

function makeReport(
  trail: DiagnosePaidResponse["competitorTrail"],
): DiagnosePaidResponse {
  return {
    competitorTrail: trail,
    dataProvenance: { competitors: "live" },
  } as unknown as DiagnosePaidResponse;
}

const baseCompetitor = {
  name: "Pickleball Stars",
  overlapKeywords: ["pickleball"],
  notes: "Overlaps on \"pickleball\".",
  provenance: "live" as const,
};

describe("CompetitorTrail", () => {
  it("renders an App Store link with target=_blank when scope.store is ios", () => {
    render(
      <CompetitorTrail
        report={makeReport([
          { ...baseCompetitor, appId: "6740270726", source: "search" },
        ])}
        scope={{ store: "ios", country: "US", appId: "1234567890" }}
      />,
    );

    const link = screen.getByRole("link", { name: /Open Pickleball Stars in App Store/i });
    expect(link).toHaveAttribute(
      "href",
      "https://apps.apple.com/us/app/id6740270726",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a Play Store link when scope.store is android", () => {
    render(
      <CompetitorTrail
        report={makeReport([
          {
            ...baseCompetitor,
            name: "Reclub",
            appId: "com.example.reclub",
            source: "similar",
          },
        ])}
        scope={{ store: "android", country: "US", appId: "com.example.app" }}
      />,
    );

    const link = screen.getByRole("link", { name: /Open Reclub in Play Store/i });
    expect(link).toHaveAttribute(
      "href",
      "https://play.google.com/store/apps/details?id=com.example.reclub&hl=en&gl=us",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no anchor and no external-link icon when scope is undefined", () => {
    const { container } = render(
      <CompetitorTrail
        report={makeReport([
          { ...baseCompetitor, appId: "6740270726", source: "search" },
        ])}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    // The ExternalLink icon is the only lucide SVG inside a card body; it
    // should not render in the no-scope fallback.
    expect(container.querySelector("svg.lucide-external-link")).toBeNull();
    // Card content still renders.
    expect(screen.getByText("Pickleball Stars")).toBeInTheDocument();
  });

  it("renders the empty-state copy when competitorTrail is empty", () => {
    render(<CompetitorTrail report={makeReport([])} />);
    expect(
      screen.getByText(/no competitor trail surfaced for this run/i),
    ).toBeInTheDocument();
  });
});
