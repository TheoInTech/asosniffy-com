import { env } from "../env.js";
import { InternalError } from "../errors.js";
import {
  createFacilitatorClient,
  type FacilitatorClient,
} from "../payment/facilitator/index.js";

let cached: FacilitatorClient | null | undefined;

// Returns null in `fixture-receipt` mode so callers can skip verify/settle and
// fabricate a fixture receipt. Throws an InternalError (per-request, not at
// boot) if `morph-official` mode is configured but credentials are missing,
// so `/sample` and `/quote` still work in zero-config local dev.
export function getFacilitator(): FacilitatorClient | null {
  if (cached !== undefined) return cached;

  if (env.MORPH_FACILITATOR_MODE === "fixture-receipt") {
    cached = null;
    return cached;
  }

  if (
    !env.MORPH_FACILITATOR_ACCESS_KEY ||
    !env.MORPH_FACILITATOR_SECRET_KEY
  ) {
    throw new InternalError(
      `MORPH_FACILITATOR_MODE=${env.MORPH_FACILITATOR_MODE} requires MORPH_FACILITATOR_ACCESS_KEY and MORPH_FACILITATOR_SECRET_KEY`,
    );
  }

  cached = createFacilitatorClient({
    accessKey: env.MORPH_FACILITATOR_ACCESS_KEY,
    secretKey: env.MORPH_FACILITATOR_SECRET_KEY,
    baseUrl: env.MORPH_FACILITATOR_URL,
  });
  return cached;
}

export function __resetFacilitatorForTests(): void {
  cached = undefined;
}
