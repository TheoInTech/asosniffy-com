import { z } from "zod";
import { DiagnosePaidResponse } from "./diagnose.js";

export const SampleResponse = DiagnosePaidResponse.extend({
  sample: z.literal(true),
});
export type SampleResponse = z.infer<typeof SampleResponse>;
