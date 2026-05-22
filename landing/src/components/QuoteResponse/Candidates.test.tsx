import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ShallowScan } from "@sniffy/scraper/schemas";
import { Candidates } from "./Candidates";

function makeShallow(overrides: Partial<ShallowScan> = {}): ShallowScan {
  return {
    title: "App",
    subtitle: "sub",
    primaryCategory: "Productivity",
    ratingsSummary: { average: 4.5, count: 100 },
    previewKeyword: {
      keyword: "test",
      rankBucket: "11-30",
      confidence: "medium",
      provenance: "live",
    },
    detectionConfidence: "medium",
    candidates: [
      {
        id: "111",
        name: "Notes",
        developer: "Acme",
        similarityScore: 0.72,
      },
      {
        id: "222",
        name: "Notebook Pro",
        developer: "Pixel Studio",
        similarityScore: 0.61,
      },
    ],
    localizationAvailable: true,
    metadataLengths: [],
    ...overrides,
  };
}

describe("Candidates", () => {
  it("renders nothing when detectionConfidence is high", () => {
    const { container } = render(
      <Candidates
        shallowScan={makeShallow({ detectionConfidence: "high" })}
        detectedAppId="111"
        onSelect={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when candidates is empty", () => {
    const { container } = render(
      <Candidates
        shallowScan={makeShallow({ candidates: [] })}
        detectedAppId="111"
        onSelect={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each candidate and disables the currently-detected one", () => {
    render(
      <Candidates
        shallowScan={makeShallow()}
        detectedAppId="111"
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("Notebook Pro")).toBeInTheDocument();
    // Selected button shows "match"; unselected shows "sim NN%".
    expect(screen.getByText("match")).toBeInTheDocument();
    expect(screen.getByText(/sim 61%/)).toBeInTheDocument();
  });

  it("fires onSelect with the candidate id when clicked", () => {
    const onSelect = vi.fn();
    render(
      <Candidates
        shallowScan={makeShallow()}
        detectedAppId="111"
        onSelect={onSelect}
      />,
    );
    // Click bubbles from the text child up to the button.
    fireEvent.click(screen.getByText("Notebook Pro"));
    expect(onSelect).toHaveBeenCalledWith("222");
  });
});
