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
}

export function useDiagnose() {
  return useMutation<DiagnosePaidResponse, Error, DiagnoseMutationInput>({
    mutationKey: ["diagnose"],
    mutationFn: ({ request, paymentHeader }) =>
      postDiagnose(request, { paymentHeader }),
  });
}
