"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  DiagnosePaidResponse,
  DiagnoseRequest,
  QuoteRequest,
  QuoteResponse,
  SampleResponse,
} from "@sniffy/scraper/schemas";
import { getQuote, getSample, postDiagnose } from "./client";
import type { ProtocolTraceEntry } from "./errors";
import {
  getHistory,
  type GetHistoryInput,
  type HistoryResponse,
} from "./history";

export function useQuote() {
  return useMutation<QuoteResponse, Error, QuoteRequest>({
    mutationKey: ["quote"],
    mutationFn: (req) => getQuote(req),
  });
}

export function useSample(enabled = true) {
  return useQuery<SampleResponse, Error>({
    queryKey: ["sample"],
    queryFn: () => getSample(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export interface DiagnoseMutationInput {
  request: DiagnoseRequest;
  paymentHeader?: string;
  onProtocolTrace?: (entry: ProtocolTraceEntry) => void;
}

export function useDiagnose() {
  return useMutation<DiagnosePaidResponse, Error, DiagnoseMutationInput>({
    mutationKey: ["diagnose"],
    mutationFn: ({ request, paymentHeader, onProtocolTrace }) =>
      postDiagnose(request, {
        ...(paymentHeader ? { paymentHeader } : {}),
        ...(onProtocolTrace ? { onProtocolTrace } : {}),
      }),
  });
}

// Phase 4 — lazy fetch of per-keyword rank history. Disabled by default;
// the consumer (the expandable keyword row) flips `enabled` when the user
// expands a keyword. Only fires when the paid /diagnose response carried
// a non-empty historySignature.
export function useKeywordHistory(
  input: GetHistoryInput | null,
  enabled: boolean,
) {
  return useQuery<HistoryResponse, Error>({
    queryKey: input
      ? [
          "history",
          input.sniffId,
          input.store,
          input.country,
          input.appId,
          input.keyword.toLowerCase(),
          input.window ?? "30d",
        ]
      : ["history", "disabled"],
    queryFn: () => {
      if (!input) throw new Error("useKeywordHistory called without input");
      return getHistory(input);
    },
    enabled: enabled && input !== null && input.signature.length > 0,
    staleTime: 60_000,
  });
}
