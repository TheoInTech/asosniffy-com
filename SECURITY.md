# Security Policy

## Reporting a Vulnerability

If you find a security issue in Sniffy — especially one that touches the x402
payment flow, the facilitator integration, wallet handling, or any code path
that affects user funds — please **do not open a public GitHub issue**.

Email **theoroque95@gmail.com** with:

- A clear description of the issue.
- Steps to reproduce.
- The smallest possible proof of concept (commands, payloads, or a short
  patch).
- Your assessment of the impact (e.g. funds at risk, data exposure, denial of
  service).

You can expect:

- An acknowledgement within **3 business days**.
- A written assessment of severity within **7 business days**.
- A fix or mitigation timeline once severity is agreed.
- Credit in the release notes when the fix ships, unless you ask to remain
  anonymous.

## Scope

In-scope:

- The `landing/` Next.js app deployed at the official Sniffy demo URL.
- The `scraper/` Hono API deployed at the official Sniffy API URL.
- The `packages/sdk`, `packages/cli`, and `packages/mcp` published to npm.
- `SKILL.md` content that instructs agents to take payment-related actions.

Out of scope (please report to the upstream project instead):

- Vulnerabilities in Morph's official x402 facilitator
  (`https://morph-rails.morph.network/x402`).
- Vulnerabilities in third-party libraries (report to the library directly).
- Findings that require physical access, social engineering, or stolen
  credentials.

## Hackathon Note

For the hackathon-period demo, Sniffy uses the **Morph Hoodi testnet**. Tokens
on Hoodi have no monetary value. Reports of "funds drained on Hoodi" are still
welcome — they indicate real bugs even when the loss isn't economic — but
should be flagged as testnet so we can triage correctly.
