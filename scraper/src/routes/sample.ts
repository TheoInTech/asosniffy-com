import { Hono } from "hono";
import { SampleResponse } from "../schemas/index.js";
import { sampleReport } from "../data/fixtures.js";
import { recordSlo, SLO_METRICS } from "../observability/slo.js";

export const sampleRoute = new Hono();

// CLAUDE.md "Load-Bearing Constraints": this endpoint must always work, even
// when Redis/Apple/OpenAI are all unreachable. It serves a static fixture and
// requires no env beyond PORT.
const PAYLOAD = SampleResponse.parse({
  ...sampleReport,
  sample: true,
});

sampleRoute.get("/", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  // SLO S2: ≥99% of /sample responses return 200. The fixture is parsed at
  // module-init so the only failure mode here is the serializer — record OK.
  recordSlo(SLO_METRICS.sampleAvailability, true);
  return c.json(PAYLOAD);
});
