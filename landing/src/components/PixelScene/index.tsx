"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useReducedMotion } from "@/lib/motion";

export type SceneName =
  | "sniffy-sniffing-loader"
  | "sniffy-x402-unlock"
  | "sniffy-no-scent"
  | "sniffy-report-reveal";

export interface PixelSceneProps {
  name: SceneName;
  play?: "loop" | "once" | "paused";
  className?: string;
  alt?: string;
  size?: number;
  onComplete?: () => void;
}

export function PixelScene({
  name,
  play = "loop",
  className,
  alt,
  size = 160,
  onComplete,
}: PixelSceneProps) {
  const reduced = useReducedMotion();
  const animate = !reduced && play !== "paused";

  // Fire onComplete after one cycle for play="once". CSS animations don't
  // emit react events for SMIL; we use a timer matched to the scene duration.
  useEffect(() => {
    if (!animate || play !== "once" || !onComplete) return;
    const id = setTimeout(onComplete, 1_200);
    return () => clearTimeout(id);
  }, [animate, name, onComplete, play]);

  const role = alt ? "img" : "presentation";
  const ariaProps = alt ? { "aria-label": alt } : { "aria-hidden": true };

  return (
    <div
      role={role}
      {...ariaProps}
      className={cn("inline-block align-middle", className)}
      style={{ width: size, height: size }}
    >
      {name === "sniffy-sniffing-loader" ? (
        <SniffingLoader animate={animate} />
      ) : name === "sniffy-x402-unlock" ? (
        <X402Unlock animate={animate} />
      ) : name === "sniffy-no-scent" ? (
        <NoScentScene animate={animate} />
      ) : (
        <ReportReveal animate={animate} />
      )}
    </div>
  );
}

function SniffingLoader({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" shape-rendering="crispEdges">
      <rect width="200" height="200" fill="transparent" />
      {[
        { cx: 40, cy: 110, r: 7, fill: "#7A6F62", delay: "0s" },
        { cx: 72, cy: 110, r: 9, fill: "#7A6F62", delay: "0.15s" },
        { cx: 108, cy: 110, r: 11, fill: "#F7D43A", delay: "0.3s" },
        { cx: 148, cy: 110, r: 13, fill: "#F7D43A", delay: "0.45s" },
      ].map((dot, i) => (
        <circle
          key={i}
          cx={dot.cx}
          cy={dot.cy}
          r={dot.r}
          fill={dot.fill}
          style={
            animate
              ? {
                  animation: `pixel-pulse 1.2s ease-in-out infinite`,
                  animationDelay: dot.delay,
                  transformOrigin: `${dot.cx}px ${dot.cy}px`,
                }
              : undefined
          }
        />
      ))}
      {/* Sniffy snout pixel art at left, nose pointing at the trail */}
      <g transform="translate(10 80) scale(2)">
        <rect x="0" y="6" width="8" height="6" fill="#15110D" />
        <rect x="-2" y="8" width="2" height="2" fill="#15110D" />
        <rect x="-2" y="8" width="2" height="2" fill="#F7D43A" />
      </g>
      <text
        x="100"
        y="170"
        fontFamily="ui-monospace, monospace"
        fontSize="14"
        fill="#15110D"
        textAnchor="middle"
      >
        Sniffing…
      </text>
    </svg>
  );
}

function X402Unlock({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" shape-rendering="crispEdges">
      <rect width="200" height="200" fill="transparent" />
      <g
        style={
          animate
            ? {
                transformOrigin: "100px 90px",
                animation: "pixel-unlock-tilt 1.1s ease-in-out forwards",
              }
            : undefined
        }
      >
        <path d="M 70 60 Q 70 30 100 30 Q 130 30 130 60" stroke="#15110D" strokeWidth="6" fill="none" />
      </g>
      <rect x="60" y="60" width="80" height="60" fill="#15110D" />
      <rect x="92" y="80" width="16" height="20" fill="#F7D43A" />
      <circle cx="100" cy="80" r="6" fill="#F7D43A" />
      <g
        style={
          animate
            ? {
                animation: "pixel-receipt-rise 1s ease-out forwards",
              }
            : undefined
        }
      >
        <rect x="70" y="135" width="60" height="6" fill="#21C2B6" />
        <rect x="70" y="145" width="40" height="6" fill="#21C2B6" />
        <rect x="70" y="155" width="50" height="6" fill="#21C2B6" />
      </g>
      <text
        x="100"
        y="184"
        fontFamily="ui-monospace, monospace"
        fontSize="12"
        fill="#15110D"
        textAnchor="middle"
      >
        unlocked
      </text>
    </svg>
  );
}

function NoScentScene({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" shape-rendering="crispEdges">
      <rect width="200" height="200" fill="transparent" />
      <g style={animate ? { animation: "pixel-fade 2.2s ease-in-out infinite" } : undefined}>
        <circle cx="40" cy="100" r="6" fill="#7A6F62" />
        <circle cx="60" cy="100" r="6" fill="#7A6F62" />
        <circle cx="80" cy="100" r="6" fill="#7A6F62" />
      </g>
      <text
        x="100"
        y="106"
        fontFamily="ui-monospace, monospace"
        fontSize="26"
        fill="#E5532D"
        fontWeight="700"
        textAnchor="middle"
      >
        ?
      </text>
      <g opacity="0.18">
        <circle cx="140" cy="100" r="6" fill="#7A6F62" />
        <circle cx="160" cy="100" r="6" fill="#7A6F62" />
      </g>
      <text
        x="100"
        y="160"
        fontFamily="ui-monospace, monospace"
        fontSize="12"
        fill="#15110D"
        textAnchor="middle"
      >
        trail goes cold
      </text>
    </svg>
  );
}

function ReportReveal({ animate }: { animate: boolean }) {
  return (
    <svg viewBox="0 0 200 200" width="100%" height="100%" shape-rendering="crispEdges">
      <rect width="200" height="200" fill="transparent" />
      {[
        { y: 56, fill: "#21C2B6", text: "SUMMARY", color: "#15110D", delay: "0s" },
        { y: 86, fill: "#F7D43A", text: "KEYWORDS", color: "#15110D", delay: "0.12s" },
        { y: 116, fill: "#E5532D", text: "ACTIONS", color: "#F7F4EC", delay: "0.24s" },
      ].map((row, i) => (
        <g
          key={i}
          style={
            animate
              ? {
                  animation: "pixel-card-slide 0.65s ease-out forwards",
                  animationDelay: row.delay,
                  transform: "translateY(8px)",
                  opacity: 0,
                }
              : undefined
          }
        >
          <rect x="36" y={row.y} width="120" height="22" fill={row.fill} stroke="#15110D" strokeWidth="2" />
          <text
            x="46"
            y={row.y + 16}
            fontFamily="ui-monospace, monospace"
            fontSize="11"
            fill={row.color}
          >
            {row.text}
          </text>
        </g>
      ))}
    </svg>
  );
}
