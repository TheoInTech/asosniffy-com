import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendBadge } from "./TrendBadge";

describe("TrendBadge", () => {
  it("renders the cold-start state when trend is null", () => {
    render(<TrendBadge trend={null} />);
    // sr-only copy explains the dash
    expect(screen.getByText(/cold start/i)).toBeInTheDocument();
  });

  it("renders 'off chart' when current rank is not_found (deltaPositions null)", () => {
    render(
      <TrendBadge
        trend={{
          window: "7d",
          deltaPositions: null,
          previousBucket: "11-30",
          samplesCount: 4,
        }}
      />,
    );
    expect(screen.getByText(/off chart/i)).toBeInTheDocument();
  });

  it("renders an improvement (negative delta) without a + sign", () => {
    render(
      <TrendBadge
        trend={{
          window: "7d",
          deltaPositions: -7,
          previousBucket: "11-30",
          samplesCount: 5,
        }}
      />,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders a regression (positive delta) with a + sign", () => {
    render(
      <TrendBadge
        trend={{
          window: "30d",
          deltaPositions: 12,
          previousBucket: "1-10",
          samplesCount: 3,
        }}
      />,
    );
    expect(screen.getByText("+12")).toBeInTheDocument();
  });

  it("renders 'flat' when delta is zero", () => {
    render(
      <TrendBadge
        trend={{
          window: "7d",
          deltaPositions: 0,
          previousBucket: "1-10",
          samplesCount: 5,
        }}
      />,
    );
    expect(screen.getByText(/flat/i)).toBeInTheDocument();
  });
});
