import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TutorialStep } from "./TutorialStep";

describe("TutorialStep", () => {
  it("renders the step number, title, and children", () => {
    render(
      <TutorialStep n={3} title="Wire it into Claude Desktop">
        <p>edit the json config</p>
      </TutorialStep>,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /wire it into claude desktop/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/edit the json config/i)).toBeInTheDocument();
  });
});
