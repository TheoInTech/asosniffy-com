"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import type {
  DiagnosePaidResponse,
  DiagnoseRequest,
  QuoteResponse,
} from "@sniffy/scraper/schemas";
import { Lottie } from "@/components/Lottie";
import { WalletConnect } from "@/components/WalletConnect";
import { useDiagnose } from "@/lib/api/hooks";
import { PaymentRequiredError } from "@/lib/api/errors";
import { isFixtureTxHash } from "@/lib/explorer";
import { morphHoodi } from "@/lib/wallet/chains";
import { buildPaymentHeader } from "@/lib/wallet/x402";
import { FundPanel } from "./FundPanel";
import { NetworkSwitchButton } from "./NetworkSwitchButton";

interface Props {
  quote: QuoteResponse;
  diagnoseRequest: DiagnoseRequest;
  onPaid: (paid: DiagnosePaidResponse) => void;
}

type Phase =
  | "idle"
  | "requesting-requirements"
  | "awaiting-signature"
  | "settling"
  | "unlocked"
  | "error";

export function UnlockTrail({ quote, diagnoseRequest, onPaid }: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { open } = useAppKit();
  const { data: walletClient } = useWalletClient();
  const diagnose = useDiagnose();

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [paidResult, setPaidResult] = useState<DiagnosePaidResponse | null>(null);

  const onWrongNetwork = isConnected && chainId !== morphHoodi.id;

  const handleUnlock = useCallback(async () => {
    setErrorText(null);
    if (!isConnected || !address) {
      open();
      return;
    }
    if (chainId !== morphHoodi.id) {
      setErrorText("Wallet is on the wrong network. Switch to Morph Hoodi and retry.");
      return;
    }
    if (!walletClient) {
      setErrorText("Wallet client not ready. Try again in a moment.");
      return;
    }

    let requirement;
    try {
      setPhase("requesting-requirements");
      // First call without a payment header — server returns 402 with
      // PaymentRequirement (which is what we need to sign).
      await diagnose.mutateAsync({ request: diagnoseRequest });
      // If we somehow got a 200 here (caching, replay), surface it.
      setPhase("unlocked");
      return;
    } catch (err: unknown) {
      if (err instanceof PaymentRequiredError) {
        requirement = err.payload.payment;
      } else {
        setPhase("error");
        setErrorText(
          err instanceof Error ? err.message : "Could not get payment requirements.",
        );
        return;
      }
    }

    try {
      setPhase("awaiting-signature");
      const header = await buildPaymentHeader({
        account: address,
        walletClient,
        requirement,
      });

      setPhase("settling");
      const paid = await diagnose.mutateAsync({
        request: diagnoseRequest,
        paymentHeader: header,
      });
      setPaidResult(paid);
      setPhase("unlocked");
      onPaid(paid);
    } catch (signErr: unknown) {
      setPhase("error");
      setErrorText(
        signErr instanceof Error
          ? signErr.message
          : "Wallet rejected the signature.",
      );
    }
  }, [
    address,
    chainId,
    diagnose,
    diagnoseRequest,
    isConnected,
    onPaid,
    open,
    walletClient,
  ]);

  const phaseLabel = useMemo(() => {
    switch (phase) {
      case "requesting-requirements":
        return "Asking the facilitator what to sign…";
      case "awaiting-signature":
        return "Sign the payment in your wallet to continue.";
      case "settling":
        return "Settling on Morph Hoodi…";
      case "unlocked": {
        if (!paidResult) return "Trail unlocked.";
        const fixture =
          paidResult.receipt.facilitatorMode === "fixture-receipt" ||
          isFixtureTxHash(paidResult.receipt.transactionHash);
        return fixture
          ? "Signature settled (demo facilitator — Hoodi pending)."
          : "Trail unlocked.";
      }
      case "error":
        return errorText ?? "Something went wrong.";
      default:
        return null;
    }
  }, [errorText, paidResult, phase]);

  return (
    <div className="space-y-3 border-2 border-sniffy-ink bg-sniffy-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Unlock the full sniff trail
        </p>
        <WalletConnect />
      </div>

      <p className="font-mono text-xs text-sniffy-ink">
        You pay {quote.pricing.estimatedTotal} {quote.pricing.currency} on{" "}
        Morph Hoodi to settle this sniff. Sniffy never custodies your wallet —
        the signature only authorizes this one transfer to the merchant.
      </p>

      {onWrongNetwork ? <NetworkSwitchButton /> : null}

      {phase === "awaiting-signature" || phase === "settling" ? (
        <div className="flex items-center gap-3 border border-sniffy-rule bg-sniffy-paper-2 p-3">
          <Lottie name="sniffy-sniffing-loader" size={48} alt="" play="loop" />
          <p className="font-mono text-xs text-sniffy-ink">{phaseLabel}</p>
        </div>
      ) : null}

      {phase === "unlocked" ? (
        <div className="flex items-center gap-3 border border-sniffy-rule bg-sniffy-paper-2 p-3">
          <Lottie name="sniffy-x402-unlock" size={48} alt="" play="once" />
          <p className="font-mono text-xs text-sniffy-ink">{phaseLabel}</p>
        </div>
      ) : null}

      {phase === "error" && errorText ? (
        <div
          role="alert"
          className="border-2 border-sniffy-warn bg-sniffy-paper-2 p-3 font-mono text-xs text-sniffy-ink"
        >
          <p className="font-display font-semibold uppercase tracking-[0.14em] text-sniffy-warn">
            Wallet snag
          </p>
          <p className="mt-1">{errorText}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleUnlock}
          disabled={
            phase === "requesting-requirements" ||
            phase === "awaiting-signature" ||
            phase === "settling"
          }
          className="inline-flex items-center gap-2 border-2 border-sniffy-ink bg-sniffy-yellow px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-sniffy-ink shadow-ink-tab transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-ink motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === "idle" || phase === "error"
            ? isConnected
              ? "Sign and unlock"
              : "Connect wallet to unlock"
            : "Working…"}
        </button>
      </div>

      <FundPanel defaultOpen={!isConnected} />
    </div>
  );
}
