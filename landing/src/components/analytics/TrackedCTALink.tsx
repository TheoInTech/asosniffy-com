"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import type { ReactNode } from "react";

type Primitive = string | number | boolean | null;
type EventProps = Record<string, Primitive>;

type Props = {
  href: string;
  eventName: string;
  eventProps?: EventProps;
  className?: string;
  children: ReactNode;
};

export function TrackedCTALink({
  href,
  eventName,
  eventProps,
  className,
  children,
}: Props) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        try {
          track(eventName, eventProps);
        } catch {
          // analytics failure must never block navigation
        }
      }}
    >
      {children}
    </Link>
  );
}
