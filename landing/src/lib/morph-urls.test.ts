import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("morph-urls", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("exposes the verified Morph Hoodi defaults", async () => {
    const { MORPH_HOODI } = await import("./morph-urls");
    expect(MORPH_HOODI.chainId).toBe(2910);
    expect(MORPH_HOODI.caip2).toBe("eip155:2910");
    expect(MORPH_HOODI.rpc).toBe("https://rpc-hoodi.morph.network");
    expect(MORPH_HOODI.explorer).toBe("https://explorer-hoodi.morphl2.io");
    expect(MORPH_HOODI.bridge).toBe("https://bridge-hoodi.morphl2.io");
    expect(MORPH_HOODI.faucet).toBe("https://faucet-hoodi.morph.network");
    expect(MORPH_HOODI.facilitator).toBe(
      "https://morph-rails.morph.network/x402",
    );
    expect(MORPH_HOODI.testnet).toBe(true);
  });

  it("exposes the Morph Mainnet defaults", async () => {
    const { MORPH_MAINNET } = await import("./morph-urls");
    expect(MORPH_MAINNET.chainId).toBe(2818);
    expect(MORPH_MAINNET.caip2).toBe("eip155:2818");
    expect(MORPH_MAINNET.rpc).toBe("https://rpc.morphl2.io");
    expect(MORPH_MAINNET.explorer).toBe("https://explorer.morphl2.io");
    expect(MORPH_MAINNET.testnet).toBe(false);
  });

  it("honours env overrides for Hoodi", async () => {
    vi.stubEnv("NEXT_PUBLIC_MORPH_HOODI_RPC", "https://custom.example/rpc");
    vi.stubEnv("NEXT_PUBLIC_MORPH_HOODI_EXPLORER", "https://custom.example/ex");
    vi.stubEnv("NEXT_PUBLIC_MORPH_HOODI_BRIDGE", "https://custom.example/br");
    vi.stubEnv("NEXT_PUBLIC_MORPH_HOODI_FAUCET", "https://custom.example/fc");
    vi.stubEnv(
      "NEXT_PUBLIC_MORPH_FACILITATOR_URL",
      "https://custom.example/x402",
    );
    const { MORPH_HOODI } = await import("./morph-urls");
    expect(MORPH_HOODI.rpc).toBe("https://custom.example/rpc");
    expect(MORPH_HOODI.explorer).toBe("https://custom.example/ex");
    expect(MORPH_HOODI.bridge).toBe("https://custom.example/br");
    expect(MORPH_HOODI.faucet).toBe("https://custom.example/fc");
    expect(MORPH_HOODI.facilitator).toBe("https://custom.example/x402");
  });

  it("resolves networks by caip-2 and chain id", async () => {
    const { morphByCaip2, morphByChainId } = await import("./morph-urls");
    expect(morphByCaip2("eip155:2910")?.name).toBe("Morph Hoodi");
    expect(morphByCaip2("eip155:2818")?.name).toBe("Morph Mainnet");
    expect(morphByCaip2("eip155:1")).toBeNull();
    expect(morphByChainId(2910)?.testnet).toBe(true);
    expect(morphByChainId(2818)?.testnet).toBe(false);
    expect(morphByChainId(1)).toBeNull();
  });
});
