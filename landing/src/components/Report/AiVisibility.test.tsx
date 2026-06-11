import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AiVisibility as AiVisibilitySchema,
  type AiVisibility as AiVisibilityType,
  type DiagnosePaidResponse,
} from "@sniffy/scraper/schemas";
import { AiVisibilityCard } from "./AiVisibility";

function makeReport(av: AiVisibilityType | null): DiagnosePaidResponse {
  return { aiVisibility: av } as unknown as DiagnosePaidResponse;
}

// Parse through the Zod schema so the fixture is guaranteed to match the
// production contract (scraper/src/schemas/diagnose.ts).
const baseVisibility = AiVisibilitySchema.parse({
  targetSov: 0.34,
  sovBand: { plusMinusPp: 5.7, basis: "v5-pilot-2026-06" },
  shareOfVoice: [
    { name: "Pickleball Stars", isTarget: false, mentions: 11, mentionRate: 0.55 },
    { name: "Court Sniff", isTarget: true, mentions: 7, mentionRate: 0.34 },
    { name: "Dink Master", isTarget: false, mentions: 2, mentionRate: 0.1 },
  ],
  promptTable: [
    {
      templateIdx: 0,
      intent: "best app for tracking pickleball games",
      prompt: "What is the best app for tracking pickleball games?",
      mentionRate: 0.5,
    },
    {
      templateIdx: 3,
      intent: "pickleball score keeper",
      prompt: "Recommend a pickleball score keeper app.",
      mentionRate: 0,
    },
  ],
  deterministicMisses: [
    {
      templateIdx: 3,
      intent: "pickleball score keeper",
      prompt: "Recommend a pickleball score keeper app.",
    },
  ],
  modelsUsed: ["gpt-4o-mini"],
  promptSetVersion: "v5-10",
  totalCalls: 20,
  failedCalls: 1,
  provenance: "live",
});

describe("AiVisibilityCard", () => {
  it("renders nothing when aiVisibility is null", () => {
    const { container } = render(<AiVisibilityCard report={makeReport(null)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders targetSov with the ±pp band attached — never SOV alone", () => {
    render(<AiVisibilityCard report={makeReport(baseVisibility)} />);
    // 34% appears both as the headline and in the target's ranked row.
    expect(screen.getAllByText("34%").length).toBeGreaterThan(0);
    const band = screen.getByText("±5.7pp");
    expect(band).toBeInTheDocument();
    // The band lives in the same group element as the headline number.
    expect(band.parentElement?.textContent).toContain("34%");
  });

  it("renders the share-of-voice list ranked with the target highlighted", () => {
    render(<AiVisibilityCard report={makeReport(baseVisibility)} />);
    const items = screen.getAllByRole("listitem");
    const text = items.map((li) => li.textContent ?? "");
    const starsIdx = text.findIndex((t) => t.includes("Pickleball Stars"));
    const targetIdx = text.findIndex((t) => t.includes("Court Sniff"));
    const dinkIdx = text.findIndex((t) => t.includes("Dink Master"));
    // Ranked by mentionRate descending.
    expect(starsIdx).toBeLessThan(targetIdx);
    expect(targetIdx).toBeLessThan(dinkIdx);
    // Target carries the explicit marker.
    expect(text[targetIdx]).toMatch(/target/i);
  });

  it("renders deterministic misses as a 'never named for' list", () => {
    render(<AiVisibilityCard report={makeReport(baseVisibility)} />);
    expect(screen.getByText(/never named for/i)).toBeInTheDocument();
    expect(screen.getAllByText("pickleball score keeper").length).toBeGreaterThan(0);
  });

  it("omits the misses block when deterministicMisses is empty", () => {
    const av = AiVisibilitySchema.parse({
      ...baseVisibility,
      deterministicMisses: [],
    });
    render(<AiVisibilityCard report={makeReport(av)} />);
    expect(screen.queryByText(/never named for/i)).toBeNull();
  });

  it("tucks the prompt table into a collapsed details element", () => {
    render(<AiVisibilityCard report={makeReport(baseVisibility)} />);
    expect(
      screen.getByText("What is the best app for tracking pickleball games?"),
    ).toBeInTheDocument();
    const details = document.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
  });

  it("renders models, call counts and provenance in the footer", () => {
    render(<AiVisibilityCard report={makeReport(baseVisibility)} />);
    expect(screen.getByText(/models: gpt-4o-mini/)).toBeInTheDocument();
    expect(screen.getByText(/20 calls \(1 failed\)/)).toBeInTheDocument();
  });
});
