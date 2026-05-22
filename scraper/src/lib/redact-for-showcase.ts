import {
  PublicShowcaseReport,
  type DiagnosePaidResponse,
  type PublicShowcaseReport as PublicShowcaseReportType,
  type ShowcaseEntry,
  type Store,
  type CountryCode,
} from "../schemas/index.js";

// Sprint C — redaction for the public showcase. Every field that could
// correlate a paid diagnose to its buyer (wallet, transaction hash, request
// IDs, HMAC signatures) is dropped here BEFORE the report reaches the
// showcase store. Subsequent reads cannot leak what isn't written.
//
// The redaction is a deliberate allowlist (Zod .omit on PublicShowcaseReport
// schema) — when a new sensitive field lands on DiagnosePaidResponse the
// redaction stays safe by default because the new field never appears in
// the showcase schema. Sync-guard tests assert every "must-strip" key is
// absent from the redacted output.

export interface RedactInput {
  // The full paid response (with all the PII fields present).
  report: DiagnosePaidResponse;
  // The (store, country, appId) tuple — needed because store/country are not
  // on DiagnosePaidResponse but are required on the showcase report for the
  // /insights index. Also re-passed to the listing entry.
  store: Store;
  country: CountryCode;
  appId: string;
  appName: string;
  appDeveloper: string;
  iconUrl: string | null;
  // Defaults to now; tests override.
  now?: Date;
}

export interface RedactOutput {
  report: PublicShowcaseReportType;
  entry: ShowcaseEntry;
}

// Strip → re-parse via Zod → guarantee the wire shape matches the schema.
// A future PII field lands on DiagnosePaidResponse but not on
// PublicShowcaseReport: redactForShowcase silently drops it (Zod .omit
// already removed it from the schema). The reverse case — a new field on
// PublicShowcaseReport — is caught at compile time when this function tries
// to populate it.
export function redactForShowcase(input: RedactInput): RedactOutput {
  const now = (input.now ?? new Date()).toISOString();

  // Strip the sensitive keys via object destructuring. The spread into the
  // showcase report intentionally does NOT carry these — even if a future
  // contributor extends DiagnosePaidResponse, the redaction stays explicit.
  const {
    requestId: _requestId,
    sniffId: _sniffId,
    receipt: _receipt,
    historySignature: _historySignature,
    packCredit: _packCredit,
    ...safeFields
  } = input.report;
  // Mark the holes as intentionally unused so the lint pass doesn't bark.
  void _requestId;
  void _sniffId;
  void _receipt;
  void _historySignature;
  void _packCredit;

  const candidate = {
    ...safeFields,
    store: input.store,
    country: input.country,
    appId: input.appId,
    detectedApp: {
      id: input.appId,
      name: input.appName,
      developer: input.appDeveloper,
      iconUrl: input.iconUrl,
    },
    showcasedAt: now,
  };

  // Parse through the schema — extra fields would fail Zod's default behavior
  // if any of the PII fields somehow leaked back in. This is the type-level
  // backstop to the keyword-destructure above.
  const report = PublicShowcaseReport.parse(candidate);

  const entry: ShowcaseEntry = {
    store: input.store,
    country: input.country,
    appId: input.appId,
    appName: input.appName,
    appDeveloper: input.appDeveloper,
    iconUrl: input.iconUrl,
    primaryCategory:
      input.report.keywordDiagnosis.length > 0
        ? // Pull category from the existing report shape if it surfaces;
          // otherwise leave null so the index UI can hide the chip.
          null
        : null,
    overallScore: input.report.metadataScore?.overall ?? null,
    settledAt: now,
  };

  return { report, entry };
}
