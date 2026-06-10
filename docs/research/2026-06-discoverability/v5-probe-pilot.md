# V5 Pilot — LLM Probe Variance (single-model)

Ran 2026-06-10 · model `gpt-5.4-mini` · 500/500 calls OK · tokens 12430 in / 32841 out · **$0.157**

SOV_r = share of the 10 intent prompts whose answer names the app, per replicate r (n=10).

| App | SOV mean | SOV SD (replicate noise) | deterministic prompts (0% or 100%) |
|---|---|---|---|
| Headspace | 80% | ±4.5pp | 8/10 |
| Duolingo | 99% | ±3.0pp | 9/10 |
| Strava | 95% | ±5.0pp | 9/10 |
| Todoist | 96% | ±4.9pp | 9/10 |
| Flighty | 51% | ±11.4pp | 2/10 |

Per-prompt mention rates (rows = apps, cols = prompt templates 1-10):

| App | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 | P10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Headspace | 100% | 100% | 100% | 100% | 100% | 20% | 0% | 100% | 80% | 100% |
| Duolingo | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 90% | 100% |
| Strava | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 50% | 100% | 100% |
| Todoist | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 60% | 100% | 100% |
| Flighty | 100% | 20% | 60% | 60% | 60% | 30% | 30% | 90% | 60% | 0% |

## Reading
- **SOV SD** is the noise floor of a 10-prompt probe: if SD is small (≲5pp), a 10-prompt single-shot probe is a stable product measurement; if large, Wave 2.1 must average across replicates or grow the prompt set.
- **Deterministic prompts** (always/never mention) measure how much of the signal is phrasing-stable; mid-rate prompts are where sampling noise lives.
- Single-model caveat: cross-model spread (Haiku/Gemini) is a separate axis, measured at Wave 2.1 build time.