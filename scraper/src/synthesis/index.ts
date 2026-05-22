export {
  synthesizeReportTemplate,
  buildDescriptionDensityRecommendation,
  type SynthesisInput,
  type SynthesisOutput,
} from "./template.js";
export {
  synthesizeReportOpenAi,
  type OpenAiSynthesisOptions,
} from "./openai.js";
export {
  buildKeywordRecommendation,
  buildMetadataNotes,
  buildCompetitorNotes,
  impactForAction,
  effortForAction,
} from "./deterministic-prose.js";
export { computeOpenAiCost, logOpenAiCost } from "./cost.js";
export {
  getOpenAiClient,
  setOpenAiClientForTests,
  resetOpenAiClientForTests,
} from "./openai-client.js";
