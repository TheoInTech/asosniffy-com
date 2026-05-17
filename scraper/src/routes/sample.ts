import { Hono } from "hono";
import { SampleResponse } from "../schemas/index.js";
import { sampleReport } from "../data/fixtures.js";

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
  return c.json(PAYLOAD);
});
