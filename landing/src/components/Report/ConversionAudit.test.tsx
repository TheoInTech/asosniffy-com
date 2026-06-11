import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ConversionAudit as ConversionAuditSchema,
  type ConversionAudit as ConversionAuditType,
  type DiagnosePaidResponse,
} from "@sniffy/scraper/schemas";
import { ConversionAuditCard } from "./ConversionAudit";

function makeReport(audit: ConversionAuditType | null): DiagnosePaidResponse {
  return { conversionAudit: audit } as unknown as DiagnosePaidResponse;
}

// Parse through the Zod schema so the fixture is guaranteed to match the
// production contract (scraper/src/schemas/diagnose.ts).
const baseAudit = ConversionAuditSchema.parse({
  ratingEconomics: {
    ratingMultiplier: {
      low: 0.85,
      high: 0.94,
      source: "NP Digital",
      year: 2024,
    },
    ratingBand: "credible",
    bandNote: "4.3 average sits in the credible band.",
    categoryCvrBaseline: {
      low: 26.4,
      high: 31.2,
      source: "AppTweak category medians",
      year: 2024,
    },
    estimatedConversionIndex: {
      low: 22.4,
      high: 29.3,
      source: "Rating multiplier (NP Digital) x category baseline (AppTweak)",
      year: 2024,
    },
    thinVolume: false,
  },
  ratingReset: {
    stance: "consider",
    rationale: "Rating predates the last three releases.",
    mechanics: "App Store Connect > App Information > Reset summary rating.",
  },
  experimentPlan: {
    feasible: true,
    daysToSignificance: { low: 14, high: 21 },
    assumptions: ["~400 page views/day", "baseline CVR 26-31%"],
    recommendation: "Run a screenshot PPO test first.",
    suggestedFirstTest: "screenshots",
    platformPath: "App Store Connect > Product Page Optimization",
  },
  provenance: "inferred",
});

describe("ConversionAuditCard", () => {
  it("renders nothing when conversionAudit is null", () => {
    const { container } = render(
      <ConversionAuditCard report={makeReport(null)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the band verdict prominently with its note", () => {
    render(<ConversionAuditCard report={makeReport(baseAudit)} />);
    expect(screen.getByText("Credible")).toBeInTheDocument();
    expect(
      screen.getByText("4.3 average sits in the credible band."),
    ).toBeInTheDocument();
  });

  it("renders every benchmark as a low–high range with source + year attribution", () => {
    render(<ConversionAuditCard report={makeReport(baseAudit)} />);
    expect(screen.getByText("0.85–0.94×")).toBeInTheDocument();
    expect(screen.getByText("NP Digital (2024)")).toBeInTheDocument();
    expect(screen.getByText("26.4–31.2%")).toBeInTheDocument();
    expect(
      screen.getByText("AppTweak category medians (2024)"),
    ).toBeInTheDocument();
    expect(screen.getByText("22.4–29.3%")).toBeInTheDocument();
  });

  it("renders the rating-reset advice card when stance is actionable", () => {
    render(<ConversionAuditCard report={makeReport(baseAudit)} />);
    expect(
      screen.getByText("Rating predates the last three releases."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Reset summary rating/),
    ).toBeInTheDocument();
  });

  it("hides the rating-reset card when stance is insufficient-data", () => {
    const audit = ConversionAuditSchema.parse({
      ...baseAudit,
      ratingReset: {
        stance: "insufficient-data",
        rationale: "Not enough rating history.",
        mechanics: "n/a",
      },
    });
    render(<ConversionAuditCard report={makeReport(audit)} />);
    expect(screen.queryByText("Not enough rating history.")).toBeNull();
  });

  it("hides the rating-reset card when ratingReset is null", () => {
    const audit = ConversionAuditSchema.parse({
      ...baseAudit,
      ratingReset: null,
    });
    render(<ConversionAuditCard report={makeReport(audit)} />);
    expect(screen.queryByText(/reset/i)).toBeNull();
  });

  it("renders the experiment plan as collapsed secondary content", () => {
    render(<ConversionAuditCard report={makeReport(baseAudit)} />);
    // Verdict + days are visible in the <summary> even while collapsed.
    expect(screen.getByText(/feasible/i)).toBeInTheDocument();
    expect(screen.getByText(/14–21 days/)).toBeInTheDocument();
    // Assumptions live inside the details body.
    expect(screen.getByText("~400 page views/day")).toBeInTheDocument();
  });

  it("flags thin ratings volume when set", () => {
    const audit = ConversionAuditSchema.parse({
      ...baseAudit,
      ratingEconomics: { ...baseAudit.ratingEconomics, thinVolume: true },
    });
    render(<ConversionAuditCard report={makeReport(audit)} />);
    expect(screen.getByText(/thin ratings volume/i)).toBeInTheDocument();
  });
});
