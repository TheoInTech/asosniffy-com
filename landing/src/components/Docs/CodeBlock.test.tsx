import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CodeBlock } from "./CodeBlock";

describe("CodeBlock", () => {
  it("renders the language chip when one is provided", () => {
    render(<CodeBlock language="json">{`{"hello":"world"}`}</CodeBlock>);
    expect(screen.getByText("json")).toBeInTheDocument();
  });

  it("renders without a language chip and still shows a copy button", () => {
    render(<CodeBlock>{`echo hi`}</CodeBlock>);
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("copies its contents to the clipboard on click and announces success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CodeBlock language="bash">{`pnpm install`}</CodeBlock>);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("pnpm install");
      expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument();
    });
  });

  it("exposes the code region as keyboard-focusable", () => {
    render(<CodeBlock language="ts">{`const x = 1;`}</CodeBlock>);
    const region = screen.getByRole("region", { name: /ts snippet/i });
    expect(region.tagName.toLowerCase()).toBe("pre");
    expect(region).toHaveAttribute("tabindex", "0");
  });
});
