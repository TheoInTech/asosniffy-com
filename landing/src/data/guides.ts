import type { ComponentType } from "react";
import { CompetitorKeywordOverlapGuide } from "@/components/guides/CompetitorKeywordOverlapGuide";
import { IosSubtitleStrategyGuide } from "@/components/guides/IosSubtitleStrategyGuide";
import { KeywordRankBucketsGuide } from "@/components/guides/KeywordRankBucketsGuide";
import { MetadataScoreExplainedGuide } from "@/components/guides/MetadataScoreExplainedGuide";

export type GuideCategory =
  | "metadata"
  | "keywords"
  | "competitors"
  | "methodology";

export type Guide = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  category: GuideCategory;
  publishedAt: string;
  readingMinutes: number;
  Component: ComponentType;
};

export const GUIDES: readonly Guide[] = [
  {
    slug: "ios-subtitle-strategy",
    title: "iOS Subtitle Strategy: The Highest-Leverage Metadata Field",
    eyebrow: "metadata",
    description:
      "Your 30-character subtitle is the strongest single metadata signal Apple ranks on. Here's how to choose what goes in it.",
    category: "metadata",
    publishedAt: "2026-05-23",
    readingMinutes: 5,
    Component: IosSubtitleStrategyGuide,
  },
  {
    slug: "competitor-keyword-overlap",
    title: "Competitor Keyword Overlap: Finding Where Rivals Outrank You",
    eyebrow: "competitors",
    description:
      "Apps ranking above you aren't just ranking — they're ranking on your keywords. Here's how to find the overlap and what to do about it.",
    category: "competitors",
    publishedAt: "2026-05-23",
    readingMinutes: 6,
    Component: CompetitorKeywordOverlapGuide,
  },
  {
    slug: "metadata-score-explained",
    title: "The Metadata Score: How Sniffy Grades Your App's ASO Health",
    eyebrow: "methodology",
    description:
      "A 0–100 score across six metadata components. What each weight measures, what penalizes it, and how to read the breakdown.",
    category: "methodology",
    publishedAt: "2026-05-23",
    readingMinutes: 5,
    Component: MetadataScoreExplainedGuide,
  },
  {
    slug: "keyword-rank-buckets",
    title:
      "Keyword Rank Buckets: Why Position 11–30 Matters and Position 51+ Doesn't",
    eyebrow: "keywords",
    description:
      "App Store rank distribution is non-linear. Sniffy buckets keywords into actionable groups — here's why that mapping is the most useful framing.",
    category: "keywords",
    publishedAt: "2026-05-23",
    readingMinutes: 4,
    Component: KeywordRankBucketsGuide,
  },
] as const;

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function getAllGuideSlugs(): string[] {
  return GUIDES.map((g) => g.slug);
}
