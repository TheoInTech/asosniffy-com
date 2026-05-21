import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  DiagnosePaidResponse,
  ReadyToPasteField,
} from "@sniffy/scraper/schemas";
import { ReadyToPaste } from "./ReadyToPaste";

function field(overrides: Partial<ReadyToPasteField> = {}): ReadyToPasteField {
  return {
    current: "current text",
    recommended: "recommended text",
    changeReason: "test reason",
    charCount: 15,
    charLimit: 30,
    ...overrides,
  };
}

function makeReport(
  readyToPaste: DiagnosePaidResponse["readyToPaste"],
): DiagnosePaidResponse {
  return { readyToPaste } as unknown as DiagnosePaidResponse;
}

describe("ReadyToPaste", () => {
  it("renders current + recommended side-by-side with the why line", () => {
    render(
      <ReadyToPaste
        report={makeReport({
          title: field({
            current: "Tally: Everything Pickleball",
            recommended: "Tally — Pickleball Scoreboard",
            changeReason: "Promotes 'scoreboard' (rank 11-30) into the title.",
            charCount: 28,
            charLimit: 30,
          }),
          subtitle: field(),
          keywordsField: field(),
          shortDescription: field(),
          source: "deterministic",
        })}
      />,
    );

    expect(screen.getByText("Tally: Everything Pickleball")).toBeInTheDocument();
    expect(screen.getByText("Tally — Pickleball Scoreboard")).toBeInTheDocument();
    expect(screen.getByText(/Promotes 'scoreboard'/)).toBeInTheDocument();
    expect(screen.getByText("28/30")).toBeInTheDocument();
  });

  it("shows a NO CHANGE badge instead of the recommended block when recommended is null", () => {
    render(
      <ReadyToPaste
        report={makeReport({
          title: field({
            current: "Tally Pickleball",
            recommended: null,
            changeReason: null,
            charCount: 16,
            charLimit: 30,
          }),
          subtitle: field(),
          keywordsField: field(),
          shortDescription: field(),
          source: "deterministic",
        })}
      />,
    );

    expect(screen.getByText(/No change/i)).toBeInTheDocument();
    // Copy button should NOT render for the NO CHANGE title card (only one
    // copy button still exists for the other fields, but not for title).
    const copyButtons = screen.getAllByRole("button", { name: /^Copy/ });
    expect(copyButtons.some((b) => b.getAttribute("aria-label") === "Copy Title")).toBe(false);
  });

  it("copies the recommended value when the copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ReadyToPaste
        report={makeReport({
          title: field({
            recommended: "Tally — Pickleball Scoreboard",
          }),
          subtitle: field(),
          keywordsField: field(),
          shortDescription: field(),
          source: "ai",
        })}
      />,
    );

    const button = screen.getByRole("button", { name: "Copy Title" });
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledWith("Tally — Pickleball Scoreboard");
  });

  it("renders the top-level source label and per-field source icon", () => {
    render(
      <ReadyToPaste
        report={makeReport({
          title: field(),
          subtitle: field(),
          keywordsField: field(),
          shortDescription: field(),
          source: "ai",
        })}
      />,
    );

    expect(screen.getByText(/AI/)).toBeInTheDocument();
  });

  it("renders an em dash when current is empty (Android short description case)", () => {
    render(
      <ReadyToPaste
        report={makeReport({
          title: field(),
          subtitle: field(),
          keywordsField: field(),
          shortDescription: field({
            current: "",
            recommended: "Tally: pickleball and scoring for clubs.",
            charCount: 40,
            charLimit: 240,
          }),
          source: "deterministic",
        })}
      />,
    );

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
