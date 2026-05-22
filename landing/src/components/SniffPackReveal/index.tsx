"use client";

// Sprint A/B — prepaid Sniff Pack reveal + browser purchase. Pack tiers stay
// hard-coded here (kept in lock-step with scraper/src/payment/pricing.ts
// SNIFF_PACK_TIERS) so the first paint is instant. Buy flow uses the same
// EIP-3009 sign + 402-retry chain as UnlockTrail, just with the SniffPack
// API client + mutation.

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { useAppKit } from "@reown/appkit/react";

import { useBuySniffPack } from "@/lib/api/hooks";
import { PaymentRequiredError } from "@/lib/api/errors";
import { morphActive } from "@/lib/wallet/chains";
import { buildPaymentHeader } from "@/lib/wallet/x402";

interface PackTile {
  id: "sniff-pack-10" | "sniff-pack-50" | "sniff-pack-250";
  label: string;
  credits: number;
  totalAmount: string;
  avgPerSniffAmount: string;
  discountPercent: number;
}

const PACKS: PackTile[] = [
  {
    id: "sniff-pack-10",
    label: "Sniff Pack 10",
    credits: 10,
    totalAmount: "4.00",
    avgPerSniffAmount: "0.40",
    discountPercent: 20,
  },
  {
    id: "sniff-pack-50",
    label: "Sniff Pack 50",
    credits: 50,
    totalAmount: "15.00",
    avgPerSniffAmount: "0.30",
    discountPercent: 40,
  },
  {
    id: "sniff-pack-250",
    label: "Sniff Pack 250",
    credits: 250,
    totalAmount: "50.00",
    avgPerSniffAmount: "0.20",
    discountPercent: 60,
  },
];

type Phase =
  | "idle"
  | "connecting"
  | "requesting-requirements"
  | "awaiting-signature"
  | "settling"
  | "success"
  | "error";

interface PurchaseState {
  phase: Phase;
  // Pack currently in-flight (idle / success / error all carry their last
  // selection so the UI can show "+10 sniffs!" against the correct card).
  packId: PackTile["id"] | null;
  // Set on success — credits granted by the latest purchase + new balance.
  result: { creditsGranted: number; newBalance: number } | null;
  // Set on error — surfaced verbatim in the card footer.
  errorText: string | null;
}

const IDLE_STATE: PurchaseState = {
  phase: "idle",
  packId: null,
  result: null,
  errorText: null,
};

function activeButtonLabel(phase: Phase): string {
  switch (phase) {
    case "connecting":
      return "Connecting wallet…";
    case "requesting-requirements":
      return "Building offer…";
    case "awaiting-signature":
      return "Sign in your wallet…";
    case "settling":
      return "Settling on Morph…";
    default:
      return "";
  }
}

// Defer mount until after hydration. The Reown AppKit singleton is created
// at module load inside <Providers>, but only on the client (SSR is a no-op
// because createAppKit touches browser APIs). On routes where this component
// is rendered in the initial paint — `/` when there's no quote yet, before
// the user has interacted — SSR / first hydration would call `useAppKit()`
// while `modal` is still undefined in @reown/appkit/react, throwing the
// "Please call createAppKit before using useAppKit hook" runtime error.
//
// Same pattern as WalletConnect: render a structurally identical static
// shell first, then swap to the AppKit-aware client subtree after mount.
export function SniffPackReveal() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <SniffPackRevealShell />;
  return <SniffPackRevealClient />;
}

function SniffPackRevealClient() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { open } = useAppKit();
  const { data: walletClient } = useWalletClient();
  const buy = useBuySniffPack();

  const [state, setState] = useState<PurchaseState>(IDLE_STATE);

  const onWrongNetwork = isConnected && chainId !== morphActive.id;

  const handleBuy = useCallback(
    async (pack: PackTile) => {
      setState({
        phase: isConnected ? "requesting-requirements" : "connecting",
        packId: pack.id,
        result: null,
        errorText: null,
      });

      if (!isConnected || !address) {
        open();
        // Reset to idle so the user can click again once wallet is connected.
        // Reown AppKit handles its own modal lifecycle; we don't await it.
        setState((prev) => ({ ...prev, phase: "idle" }));
        return;
      }
      if (chainId !== morphActive.id) {
        setState({
          phase: "error",
          packId: pack.id,
          result: null,
          errorText: `Wallet is on the wrong network. Switch to ${morphActive.name} and retry.`,
        });
        return;
      }
      if (!walletClient) {
        setState({
          phase: "error",
          packId: pack.id,
          result: null,
          errorText: "Wallet client not ready. Try again in a moment.",
        });
        return;
      }

      // Step 1: 402 to collect the PaymentRequirement.
      let requirement;
      try {
        await buy.mutateAsync({ request: { packId: pack.id } });
        // A 200 here would mean the server settled without a payment header
        // — that's a bug in production but we treat it as success for UX.
        setState({
          phase: "success",
          packId: pack.id,
          result: { creditsGranted: pack.credits, newBalance: pack.credits },
          errorText: null,
        });
        return;
      } catch (err: unknown) {
        if (err instanceof PaymentRequiredError) {
          requirement = err.payload.payment;
        } else {
          setState({
            phase: "error",
            packId: pack.id,
            result: null,
            errorText:
              err instanceof Error
                ? err.message
                : "Could not get payment requirements.",
          });
          return;
        }
      }

      // Step 2: sign EIP-3009 authorization.
      let paymentHeader: string;
      try {
        setState((prev) => ({ ...prev, phase: "awaiting-signature" }));
        paymentHeader = await buildPaymentHeader({
          account: address,
          walletClient,
          requirement,
        });
      } catch (err: unknown) {
        setState({
          phase: "error",
          packId: pack.id,
          result: null,
          errorText:
            err instanceof Error
              ? err.message
              : "Wallet rejected the signature.",
        });
        return;
      }

      // Step 3: retry the buy with the signed payment header.
      try {
        setState((prev) => ({ ...prev, phase: "settling" }));
        const settled = await buy.mutateAsync({
          request: { packId: pack.id },
          paymentHeader,
        });
        setState({
          phase: "success",
          packId: pack.id,
          result: {
            creditsGranted: settled.creditsGranted,
            newBalance: settled.newBalance,
          },
          errorText: null,
        });
      } catch (err: unknown) {
        setState({
          phase: "error",
          packId: pack.id,
          result: null,
          errorText:
            err instanceof Error
              ? err.message
              : "Pack purchase failed at the facilitator.",
        });
      }
    },
    [address, buy, chainId, isConnected, open, walletClient],
  );

  const reset = useCallback(() => setState(IDLE_STATE), []);

  const inFlight =
    state.phase !== "idle" &&
    state.phase !== "success" &&
    state.phase !== "error";

  return (
    <section
      aria-labelledby="sniff-pack-reveal-heading"
      className="border-2 border-sniffy-ink bg-sniffy-paper p-5 md:p-7 shadow-ink-tab"
    >
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sniffy-warn">
        Prepaid bulk
      </p>
      <h2
        id="sniff-pack-reveal-heading"
        className="mt-2 font-display text-2xl font-semibold leading-tight text-sniffy-ink md:text-3xl"
      >
        Need lots of sniffs? Buy a pack.
      </h2>
      <p className="mt-2 max-w-prose font-mono text-sm text-sniffy-ink-2">
        Prepay once, decrement per call. No subscription, no auto-renew, no
        card on file. Even the largest pack is cheaper than one month of a
        typical ASO subscription.
      </p>

      {onWrongNetwork ? (
        <p
          role="alert"
          className="mt-4 border-2 border-sniffy-warn bg-sniffy-paper-2 px-3 py-2 font-mono text-xs text-sniffy-ink"
        >
          Wallet is on the wrong network. Switch to{" "}
          <strong className="font-semibold">{morphActive.name}</strong> to buy
          a pack.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {PACKS.map((pack) => {
          const isThisPackInFlight = inFlight && state.packId === pack.id;
          const isThisPackSuccess =
            state.phase === "success" && state.packId === pack.id;
          const isThisPackError =
            state.phase === "error" && state.packId === pack.id;
          const buttonDisabled = inFlight && !isThisPackInFlight;

          return (
            <article
              key={pack.id}
              className={`border-2 border-sniffy-ink p-4 md:p-5 ${
                isThisPackSuccess
                  ? "bg-sniffy-teal"
                  : "bg-sniffy-paper-2"
              }`}
            >
              <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-sniffy-ink-mute">
                {pack.label}
              </p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-sniffy-ink">
                ${pack.totalAmount}
              </p>
              <p className="mt-1 font-mono text-xs text-sniffy-ink-2">
                <strong className="font-semibold tabular-nums text-sniffy-ink">
                  {pack.credits}
                </strong>{" "}
                sniffs ·{" "}
                <span className="tabular-nums">${pack.avgPerSniffAmount}</span>{" "}
                avg
              </p>
              <p className="mt-2 inline-block border border-sniffy-warn bg-sniffy-paper px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-warn">
                {pack.discountPercent}% off
              </p>

              {isThisPackSuccess && state.result ? (
                <div className="mt-3">
                  <p className="font-display text-sm font-semibold text-sniffy-ink">
                    +{state.result.creditsGranted} sniffs unlocked
                  </p>
                  <p className="mt-1 font-mono text-xs text-sniffy-ink-2">
                    New balance:{" "}
                    <strong className="font-semibold tabular-nums text-sniffy-ink">
                      {state.result.newBalance}
                    </strong>
                  </p>
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-2 inline-flex items-center border border-sniffy-ink bg-sniffy-paper px-3 py-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink hover:bg-sniffy-paper-2"
                  >
                    Buy another
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleBuy(pack)}
                  disabled={buttonDisabled}
                  aria-busy={isThisPackInFlight ? "true" : "false"}
                  className="mt-3 inline-flex w-full items-center justify-center border-2 border-sniffy-ink bg-sniffy-yellow px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {isThisPackInFlight
                    ? activeButtonLabel(state.phase)
                    : isConnected
                      ? `Buy ${pack.label}`
                      : "Connect wallet to buy"}
                </button>
              )}

              {isThisPackError && state.errorText ? (
                <p
                  role="alert"
                  className="mt-2 font-mono text-[10px] text-sniffy-warn"
                >
                  {state.errorText}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>

      <p className="mt-4 font-mono text-[10px] text-sniffy-ink-mute">
        Purchase via{" "}
        <code className="font-mono text-sniffy-ink">
          POST /api/v1/aso/sniff-pack/buy
        </code>
        , spend via{" "}
        <code className="font-mono text-sniffy-ink">
          Authorization: Bearer
        </code>{" "}
        on <code className="font-mono text-sniffy-ink">/diagnose</code> — one
        credit per call, any tier.
      </p>
    </section>
  );
}

// Pre-mount placeholder. Structurally identical to the live component so SSR
// HTML matches the first client render — no hydration mismatch — and the
// layout doesn't jump when the AppKit-aware subtree takes over. Buttons are
// inert here; on mount, <SniffPackRevealClient /> replaces this in-place and
// the same buttons become live with full wallet wiring.
function SniffPackRevealShell() {
  return (
    <section
      aria-labelledby="sniff-pack-reveal-heading"
      className="border-2 border-sniffy-ink bg-sniffy-paper p-5 md:p-7 shadow-ink-tab"
    >
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sniffy-warn">
        Prepaid bulk
      </p>
      <h2
        id="sniff-pack-reveal-heading"
        className="mt-2 font-display text-2xl font-semibold leading-tight text-sniffy-ink md:text-3xl"
      >
        Need lots of sniffs? Buy a pack.
      </h2>
      <p className="mt-2 max-w-prose font-mono text-sm text-sniffy-ink-2">
        Prepay once, decrement per call. No subscription, no auto-renew, no
        card on file. Even the largest pack is cheaper than one month of a
        typical ASO subscription.
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {PACKS.map((pack) => (
          <article
            key={pack.id}
            className="border-2 border-sniffy-ink p-4 md:p-5 bg-sniffy-paper-2"
          >
            <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-sniffy-ink-mute">
              {pack.label}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-sniffy-ink">
              ${pack.totalAmount}
            </p>
            <p className="mt-1 font-mono text-xs text-sniffy-ink-2">
              <strong className="font-semibold tabular-nums text-sniffy-ink">
                {pack.credits}
              </strong>{" "}
              sniffs ·{" "}
              <span className="tabular-nums">${pack.avgPerSniffAmount}</span>{" "}
              avg
            </p>
            <p className="mt-2 inline-block border border-sniffy-warn bg-sniffy-paper px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-warn">
              {pack.discountPercent}% off
            </p>
            <button
              type="button"
              disabled
              aria-busy="false"
              className="mt-3 inline-flex w-full items-center justify-center border-2 border-sniffy-ink bg-sniffy-yellow px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Connect wallet to buy
            </button>
          </article>
        ))}
      </div>
      <p className="mt-4 font-mono text-[10px] text-sniffy-ink-mute">
        Purchase via{" "}
        <code className="font-mono text-sniffy-ink">
          POST /api/v1/aso/sniff-pack/buy
        </code>
        , spend via{" "}
        <code className="font-mono text-sniffy-ink">
          Authorization: Bearer
        </code>{" "}
        on <code className="font-mono text-sniffy-ink">/diagnose</code> — one
        credit per call, any tier.
      </p>
    </section>
  );
}
