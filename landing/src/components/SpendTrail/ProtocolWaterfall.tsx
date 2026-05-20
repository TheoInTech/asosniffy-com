"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ProtocolTraceEntry } from "@/lib/api/errors";
import { cn } from "@/lib/cn";

interface Props {
  entries: ProtocolTraceEntry[];
  className?: string;
}

function decodeBase64Json(value: string | undefined): unknown {
  if (!value) return null;
  try {
    const json =
      typeof window !== "undefined" && typeof window.atob === "function"
        ? window.atob(value)
        : Buffer.from(value, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function statusTint(status: number): string {
  if (status >= 200 && status < 300) return "bg-sniffy-teal text-sniffy-ink";
  if (status === 402) return "bg-sniffy-yellow text-sniffy-ink";
  if (status >= 400) return "bg-sniffy-warn text-sniffy-ink";
  return "bg-sniffy-paper-2 text-sniffy-ink";
}

function statusLabel(status: number): string {
  if (status === 402) return "402 PAYMENT REQUIRED";
  if (status === 200) return "200 OK";
  if (status >= 200 && status < 300) return `${status} OK`;
  if (status >= 400) return `${status} ERROR`;
  return String(status);
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

function PrettyJson({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="font-mono text-[11px] text-sniffy-ink-mute">(empty)</span>;
  }
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all border border-sniffy-rule bg-sniffy-paper p-2 font-mono text-[11px] leading-snug text-sniffy-ink">
      {text}
    </pre>
  );
}

function HeaderList({
  headers,
  highlight,
}: {
  headers: Record<string, string>;
  highlight?: string[];
}) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return (
      <span className="font-mono text-[11px] text-sniffy-ink-mute">(none)</span>
    );
  }
  const highlightLower = (highlight ?? []).map((h) => h.toLowerCase());
  return (
    <dl className="grid gap-1 font-mono text-[11px]">
      {entries.map(([name, value]) => {
        const isHighlight = highlightLower.includes(name.toLowerCase());
        return (
          <div key={name} className="grid grid-cols-[max-content_1fr] gap-2">
            <dt
              className={cn(
                "uppercase tracking-[0.06em]",
                isHighlight ? "text-sniffy-warn" : "text-sniffy-ink-mute",
              )}
            >
              {name}:
            </dt>
            <dd className="break-all text-sniffy-ink">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Row({ entry }: { entry: ProtocolTraceEntry }) {
  const [open, setOpen] = useState(false);

  // Decode the canonical x402 headers if present so judges see the actual
  // protocol payload, not just an opaque Base64 blob.
  const decodedRequired = decodeBase64Json(
    entry.responseHeaders["payment-required"],
  );
  const decodedResponse = decodeBase64Json(
    entry.responseHeaders["payment-response"],
  );
  const sentPayment = entry.requestHeaders["PAYMENT-SIGNATURE"] ??
    entry.requestHeaders["payment-signature"];
  const decodedSent = decodeBase64Json(sentPayment);

  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-sniffy-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={11} aria-hidden />
        ) : (
          <ChevronRight size={11} aria-hidden />
        )}
        <span
          className={cn(
            "border-2 border-sniffy-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
            statusTint(entry.status),
          )}
        >
          {statusLabel(entry.status)}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-sniffy-ink-mute">
          {entry.method}
        </span>
        <span className="truncate font-mono text-[11px] text-sniffy-ink">
          {pathOf(entry.url)}
        </span>
        {sentPayment ? (
          <span
            className="ml-auto border border-sniffy-ink bg-sniffy-paper-2 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-[0.16em] text-sniffy-ink"
            title="Request sent PAYMENT-SIGNATURE header"
          >
            +X-PAYMENT
          </span>
        ) : null}
        <span className="ml-2 font-mono text-[10px] text-sniffy-ink-mute">
          {entry.durationMs}ms
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-sniffy-rule p-3">
          {decodedRequired !== null ? (
            <section>
              <h5 className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-warn">
                PAYMENT-REQUIRED (decoded)
              </h5>
              <p className="mt-1 font-mono text-[10px] text-sniffy-ink-mute">
                Server told the client what to sign. Base64-JSON per x402 V2 spec.
              </p>
              <div className="mt-2">
                <PrettyJson value={decodedRequired} />
              </div>
            </section>
          ) : null}

          {decodedSent !== null ? (
            <section>
              <h5 className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-warn">
                PAYMENT-SIGNATURE sent (decoded)
              </h5>
              <p className="mt-1 font-mono text-[10px] text-sniffy-ink-mute">
                Client&apos;s signed EIP-3009 authorization, Base64-JSON.
              </p>
              <div className="mt-2">
                <PrettyJson value={decodedSent} />
              </div>
            </section>
          ) : null}

          {decodedResponse !== null ? (
            <section>
              <h5 className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-warn">
                PAYMENT-RESPONSE (decoded)
              </h5>
              <p className="mt-1 font-mono text-[10px] text-sniffy-ink-mute">
                Settlement receipt the server attached to the 200.
              </p>
              <div className="mt-2">
                <PrettyJson value={decodedResponse} />
              </div>
            </section>
          ) : null}

          <details>
            <summary className="cursor-pointer font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute hover:text-sniffy-ink">
              Request headers
            </summary>
            <div className="mt-2">
              <HeaderList
                headers={entry.requestHeaders}
                highlight={["PAYMENT-SIGNATURE"]}
              />
            </div>
          </details>

          <details>
            <summary className="cursor-pointer font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute hover:text-sniffy-ink">
              Response headers
            </summary>
            <div className="mt-2">
              <HeaderList
                headers={entry.responseHeaders}
                highlight={["payment-required", "payment-response"]}
              />
            </div>
          </details>

          <details>
            <summary className="cursor-pointer font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute hover:text-sniffy-ink">
              Response body
            </summary>
            <div className="mt-2">
              <PrettyJson value={entry.responseBody} />
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}

export function ProtocolWaterfall({ entries, className }: Props) {
  if (entries.length === 0) return null;
  return (
    <section
      className={cn(
        "border-2 border-sniffy-ink bg-sniffy-paper-2 p-4",
        className,
      )}
    >
      <header className="mb-3">
        <h4 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          x402 protocol waterfall
        </h4>
        <p className="mt-1 font-mono text-[11px] text-sniffy-ink">
          The exact HTTP exchange this sniff settled with. Server returned{" "}
          <span className="bg-sniffy-yellow px-1">402</span> with payment
          requirements, then your wallet&apos;s signed authorization in{" "}
          <code className="font-mono">PAYMENT-SIGNATURE</code> produced a{" "}
          <span className="bg-sniffy-teal px-1">200</span> with a settlement
          receipt in <code className="font-mono">PAYMENT-RESPONSE</code>. This
          is the protocol — no demo magic.
        </p>
      </header>
      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <Row key={`${entry.startedAt}-${idx}`} entry={entry} />
        ))}
      </div>
    </section>
  );
}
