import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Callout } from "./Callout";

describe("Callout", () => {
  it("uses the warn role for warnings so screen readers announce them", () => {
    render(
      <Callout tone="warn" title="Heads up">
        <p>fund a fresh wallet</p>
      </Callout>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/fund a fresh wallet/i);
  });

  it("falls back to a note role for info / status tones", () => {
    render(
      <Callout tone="info">
        <p>defaults</p>
      </Callout>,
    );
    expect(screen.getByRole("note")).toHaveTextContent(/defaults/i);
  });

  it("renders the default tag label when no title is provided", () => {
    render(
      <Callout tone="status">
        <p>provisional</p>
      </Callout>,
    );
    expect(screen.getByText("Status")).toBeInTheDocument();
  });
});
