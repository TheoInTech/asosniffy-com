"use client";

import { useMemo, useState } from "react";
import type {
  DiagnosePaidResponse,
  DiagnoseRequest,
  QuoteRequest,
  QuoteResponse,
} from "@sniffy/scraper/schemas";
import { Hero } from "@/components/Hero";
import { NoScent } from "@/components/NoScent";
import { shouldShowNoScent, type NoScentReason } from "@/components/NoScent/triggers";
import { QuoteForm } from "@/components/QuoteForm";
import { QuoteResponseView } from "@/components/QuoteResponse";
import { Report } from "@/components/Report";
import { UnlockTrail } from "@/components/UnlockTrail";
import { useQuote } from "@/lib/api/hooks";

export function HomeView() {
  const quoteMutation = useQuote();
  const [lastRequest, setLastRequest] = useState<QuoteRequest | null>(null);
  const [paidReport, setPaidReport] = useState<DiagnosePaidResponse | null>(null);

  const quote: QuoteResponse | null = quoteMutation.data ?? null;

  const noScentReason: NoScentReason | null = useMemo(() => {
    if (!quote) return null;
    return shouldShowNoScent({ quote });
  }, [quote]);

  const diagnoseRequest: DiagnoseRequest | null = useMemo(() => {
    if (!quote || !lastRequest) return null;
    // Cap keywords at 5 for /diagnose (per schema).
    return {
      sniffId: quote.sniffId,
      store: lastRequest.store,
      app: lastRequest.app,
      country: lastRequest.country,
      keywords: lastRequest.keywords.slice(0, 5),
    };
  }, [lastRequest, quote]);

  const handleSubmit = (req: QuoteRequest) => {
    setPaidReport(null);
    setLastRequest(req);
    quoteMutation.mutate(req);
  };

  const reset = () => {
    quoteMutation.reset();
    setLastRequest(null);
    setPaidReport(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
      <Hero />

      <div className="mt-8 border-2 border-sniffy-ink bg-sniffy-paper p-5 md:p-8 shadow-ink-tab">
        <QuoteForm
          onSubmit={handleSubmit}
          isPending={quoteMutation.isPending}
          serverError={
            quoteMutation.error
              ? quoteMutation.error.message
              : null
          }
        />
      </div>

      {quote && noScentReason ? (
        <div className="mt-8">
          <NoScent reason={noScentReason} onReset={reset} />
        </div>
      ) : null}

      {quote && !noScentReason && !paidReport ? (
        <div className="mt-8 space-y-6">
          <QuoteResponseView quote={quote} onUnlock={() => undefined} />
          {diagnoseRequest ? (
            <UnlockTrail
              quote={quote}
              diagnoseRequest={diagnoseRequest}
              onPaid={(paid: DiagnosePaidResponse) => setPaidReport(paid)}
            />
          ) : null}
        </div>
      ) : null}

      {paidReport ? (
        <div className="mt-8">
          <Report report={paidReport} />
        </div>
      ) : null}
    </div>
  );
}
