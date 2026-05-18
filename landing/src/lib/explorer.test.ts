import { describe, expect, it } from "vitest";
import { buildExplorerUrl, isFixtureTxHash, networkLabel } from "./explorer";

describe("buildExplorerUrl", () => {
  it("returns a Hoodi explorer URL for eip155:2910", () => {
    const url = buildExplorerUrl("eip155:2910", "0xabc123");
    expect(url).toMatch(/^https?:\/\/.+\/tx\/0xabc123$/);
    expect(url).toContain("explorer-hoodi.morphl2.io");
  });

  it("returns a Mainnet explorer URL for eip155:2818", () => {
    const url = buildExplorerUrl("eip155:2818", "0xdeadbeef");
    expect(url).toBe("https://explorer.morphl2.io/tx/0xdeadbeef");
  });

  it("returns null for unknown CAIP-2 ids", () => {
    expect(buildExplorerUrl("eip155:1", "0x1")).toBeNull();
  });

  it("returns null for empty tx hashes", () => {
    expect(buildExplorerUrl("eip155:2910", "")).toBeNull();
  });

  it("returns null for fixture (0xsample…) tx hashes", () => {
    expect(buildExplorerUrl("eip155:2910", "0xsample01")).toBeNull();
    expect(buildExplorerUrl("eip155:2818", "0xsampleffff")).toBeNull();
  });
});

describe("isFixtureTxHash", () => {
  it.each([
    ["0xsample01", true],
    ["0xsampleffff", true],
    ["0xabc123", false],
    ["", false],
  ])("classifies %s as fixture=%s", (hash, expected) => {
    expect(isFixtureTxHash(hash)).toBe(expected);
  });
});

describe("networkLabel", () => {
  it.each([
    ["eip155:2910", "Morph Hoodi"],
    ["eip155:2818", "Morph Mainnet"],
    ["eip155:999", "eip155:999"],
  ])("labels %s as %s", (caip, label) => {
    expect(networkLabel(caip)).toBe(label);
  });
});
