import { z } from "zod";
import { CountryCode, type Store } from "@sniffy/scraper/schemas";

export const TOP_COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "JP", label: "Japan" },
  { code: "BR", label: "Brazil" },
  { code: "IN", label: "India" },
  { code: "PH", label: "Philippines" },
];

export const KEYWORD_MIN = 1;
export const KEYWORD_MAX = 5;

export const FormSchema = z.object({
  store: z.enum(["ios", "android"]),
  app: z.string().min(1, "Enter an App Store URL, numeric ID, or app name."),
  country: CountryCode,
  keywords: z
    .array(z.string().min(1, "Keyword cannot be empty"))
    .min(KEYWORD_MIN, `Add at least ${KEYWORD_MIN} keyword.`)
    .max(KEYWORD_MAX, `You can submit up to ${KEYWORD_MAX} keywords.`),
  competitorIds: z.array(z.string().min(1)).max(5).default([]),
});

export type FormValues = z.infer<typeof FormSchema>;

export const INITIAL_VALUES: FormValues = {
  store: "ios" satisfies Store,
  app: "",
  country: "US",
  keywords: [],
  competitorIds: [],
};
