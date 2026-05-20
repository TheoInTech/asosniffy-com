"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { QuoteRequest, QuoteResponse } from "@sniffy/scraper/schemas";
import { cn } from "@/lib/cn";
import { AdvancedSection } from "./AdvancedSection";
import { CountrySelect } from "./CountrySelect";
import { KeywordChips } from "./KeywordChips";
import {
  FormSchema,
  INITIAL_VALUES,
  type FormValues,
} from "./validation";

type FieldErrors = Partial<Record<keyof FormValues, string>>;

interface Props {
  onSubmit: (req: QuoteRequest) => void;
  isPending: boolean;
  serverError?: string | null;
  initialValues?: FormValues;
  result?: QuoteResponse | null;
}

export function QuoteForm({
  onSubmit,
  isPending,
  serverError,
  initialValues,
}: Props) {
  const [values, setValues] = useState<FormValues>(initialValues ?? INITIAL_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});

  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = FormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormValues | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    const req: QuoteRequest = {
      store: parsed.data.store,
      app: parsed.data.app,
      country: parsed.data.country,
      keywords: parsed.data.keywords,
    };
    onSubmit(req);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px]">
        <div>
          <label
            htmlFor="app"
            className="mb-2 block font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink"
          >
            App URL, App Store ID, or name
          </label>
          <input
            id="app"
            type="text"
            value={values.app}
            onChange={(e) => update("app", e.target.value)}
            placeholder="https://apps.apple.com/us/app/.../id1234567890"
            aria-invalid={Boolean(errors.app)}
            aria-describedby={errors.app ? "app-error" : undefined}
            className={cn(
              "w-full border-2 border-sniffy-ink bg-sniffy-paper px-3 py-2 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow",
              errors.app ? "border-sniffy-warn" : "",
            )}
          />
          {errors.app ? (
            <p id="app-error" role="alert" className="mt-1 text-xs text-sniffy-warn">
              {errors.app}
            </p>
          ) : null}
        </div>
        <CountrySelect value={values.country} onChange={(c) => update("country", c)} />
      </div>

      <KeywordChips
        value={values.keywords}
        onChange={(k) => update("keywords", k)}
        error={errors.keywords}
      />

      <AdvancedSection
        competitorIds={values.competitorIds}
        onChange={(c) => update("competitorIds", c)}
      />

      {serverError ? (
        <div
          role="alert"
          className="border-2 border-sniffy-warn bg-sniffy-paper-2 px-3 py-2 text-sm text-sniffy-ink"
        >
          <span className="font-display font-semibold uppercase tracking-[0.12em] text-sniffy-warn">
            Snag:
          </span>{" "}
          {serverError}
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "inline-flex items-center gap-2 border-2 border-sniffy-ink bg-sniffy-yellow px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-sniffy-ink shadow-ink-tab transition-transform",
            "hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_#15110D]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-ink focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper",
            "motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {isPending ? (
            <>
              <Loader2 size={14} className="animate-spin motion-reduce:hidden" />
              <span className="motion-reduce:inline hidden">Sniffing…</span>
              <span className="inline motion-reduce:hidden">Sniffing…</span>
            </>
          ) : (
            "Run free sniff test"
          )}
        </button>
        {isPending ? (
          <Image
            src="/sniffy/sniffing.png"
            alt=""
            width={56}
            height={56}
          />
        ) : null}
      </div>
    </form>
  );
}
