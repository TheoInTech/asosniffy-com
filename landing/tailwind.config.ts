import type { Config } from "tailwindcss";

// Palette and typography decisions are pinned in PLAN.md §13 and
// docs/05-frontend-landing.md §05.s1. Inconsolata carries the primary voice
// (body, headlines, monospace data) and Space Grotesk is the secondary display
// face for callouts and labels.
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sniffy: {
          paper: "#F7F4EC",
          ink: "#15110D",
          yellow: "#F7D43A",
          teal: "#21C2B6",
          warn: "#E5532D",
          // Surface variants derived from the core palette for layered
          // backgrounds without introducing new brand tokens.
          "paper-2": "#EFEADB",
          "ink-2": "#3A322A",
          "ink-mute": "#7A6F62",
          rule: "#D9D1BD",
        },
      },
      fontFamily: {
        // Primary is Inconsolata (monospace) per user direction; Space Grotesk
        // is the secondary display face. Both are wired through next/font CSS
        // variables in src/app/layout.tsx.
        sans: ["var(--font-inconsolata)", "ui-monospace", "monospace"],
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        mono: ["var(--font-inconsolata)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "ink-tab": "4px 4px 0 0 #15110D",
        "ink-tab-sm": "2px 2px 0 0 #15110D",
      },
      borderWidth: {
        ink: "2px",
      },
      keyframes: {
        "pixel-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(0.95)" },
        },
      },
      animation: {
        "pixel-pulse": "pixel-pulse 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
