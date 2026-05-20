import { PaymentRequiredError } from "@sniffy/sdk";

type ToolErrorResult = {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
};

export function mapSdkError(err: unknown): ToolErrorResult {
  if (err instanceof PaymentRequiredError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            `Payment required. Configure SNIFFY_PRIVATE_KEY (Morph Mainnet wallet with USDC) and retry.\n` +
            `network: ${err.payment.network}  amount: ${err.payment.amount}  payTo: ${err.payment.payTo}`,
        },
      ],
      structuredContent: {
        code: "payment_required",
        sniffId: err.sniffId,
        payment: {
          x402Version: err.payment.x402Version,
          network: err.payment.network,
          facilitator: err.payment.facilitator,
          amount: err.payment.amount,
          asset: err.payment.asset,
          payTo: err.payment.payTo,
        },
      },
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
