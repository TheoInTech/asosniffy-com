import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MetadataMechanics as MetadataMechanicsSchema,
  type MetadataMechanics as MetadataMechanicsType,
  type DiagnosePaidResponse,
} from "@sniffy/scraper/schemas";
import { MetadataMechanicsCard } from "./MetadataMechanics";

function makeReport(
  mechanics: MetadataMechanicsType | null,
): DiagnosePaidResponse {
  return { metadataMechanics: mechanics } as unknown as DiagnosePaidResponse;
}

// Parse through the Zod schema so the fixture is guaranteed to match the
// production contract (scraper/src/schemas/diagnose.ts).
const baseMechanics = MetadataMechanicsSchema.parse({
  totalCharsWasted: 23,
  findings: [
    {
      kind: "cross-field-duplicate",
      field: "subtitle",
      token: "tracker",
      detail: "\"tracker\" already indexed from the title.",
      charsWasted: 7,
      ruleProvenance: "apple-documented",
    },
    {
      kind: "plural-duplicate",
      field: "keywordsField",
      token: "games",
      detail: "Plural of \"game\" — singular is community-reported sufficient.",
      charsWasted: 5,
      ruleProvenance: "community-tested",
    },
  ],
  distinctIndexedTokens: 14,
  phrasePermutations: 12,
  phrasePermutationsIfFixed: 28,
  notes: ["Keyword field analysis based on paste-in input."],
  keywordsFieldProvided: true,
  reviewSafety: [
    {
      field: "subtitle",
      term: "best",
      rule: "Superlative claims risk App Review rejection (4.1).",
      severity: "warning",
      store: "ios",
    },
  ],
  provenance: "inferred",
});

describe("MetadataMechanicsCard", () => {
  it("renders nothing when metadataMechanics is null", () => {
    const { container } = render(
      <MetadataMechanicsCard report={makeReport(null)} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders totalCharsWasted as the headline", () => {
    render(<MetadataMechanicsCard report={makeReport(baseMechanics)} />);
    expect(screen.getByText("23")).toBeInTheDocument();
    expect(screen.getByText(/chars wasted/i)).toBeInTheDocument();
  });

  it("renders one finding row per finding with token, field and chars", () => {
    render(<MetadataMechanicsCard report={makeReport(baseMechanics)} />);
    expect(screen.getByText("tracker")).toBeInTheDocument();
    expect(screen.getByText("games")).toBeInTheDocument();
    expect(screen.getByText("subtitle")).toBeInTheDocument();
  });

  it("labels each finding with its rule provenance badge", () => {
    render(<MetadataMechanicsCard report={makeReport(baseMechanics)} />);
    expect(screen.getByText("Apple-documented")).toBeInTheDocument();
    expect(screen.getByText("community-tested")).toBeInTheDocument();
  });

  it("renders phrase permutations before and after the fix", () => {
    render(<MetadataMechanicsCard report={makeReport(baseMechanics)} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(screen.getByText(/if fixed/i)).toBeInTheDocument();
  });

  it("renders review-safety flags as warning chips", () => {
    render(<MetadataMechanicsCard report={makeReport(baseMechanics)} />);
    expect(screen.getByText(/Superlative claims/)).toBeInTheDocument();
    expect(screen.getByText(/"best"/)).toBeInTheDocument();
  });

  it("renders a clean state instead of a table when there are no findings", () => {
    const mechanics = MetadataMechanicsSchema.parse({
      ...baseMechanics,
      totalCharsWasted: 0,
      findings: [],
      reviewSafety: [],
    });
    render(<MetadataMechanicsCard report={makeReport(mechanics)} />);
    expect(screen.getByText(/no mechanics findings/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
