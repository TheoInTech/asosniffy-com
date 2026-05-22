# @sniffy/aso-knowledge

> Curated App Store Optimization best practices as an MCP server. Pure knowledge — no wallet, no payment, no network.

`@sniffy/aso-knowledge` is the standalone-knowledge surface for Sniffy. It pairs with `@sniffy/mcp` (paid ASO diagnoses over x402) but ships independently so agents can ground their ASO recommendations in primary-source citations *without* configuring a wallet.

## Install

```bash
npm i -g @sniffy/aso-knowledge
```

Or use `npx`:

```bash
npx -y @sniffy/aso-knowledge
```

## MCP config (Claude Desktop / Cursor)

```json
{
  "mcpServers": {
    "sniffy-aso-knowledge": {
      "command": "npx",
      "args": ["-y", "@sniffy/aso-knowledge"]
    }
  }
}
```

No env vars required — knowledge is free.

## Tools

| Tool | Args | Returns |
|---|---|---|
| `aso_knowledge_list_topics` | _none_ | Every curated topic with its summary and primary-source citation. Use to ground a new ASO conversation. |
| `aso_knowledge_get_topic` | `{ topic }` | Full curated entry for a specific topic key, or `topic_not_found` when the key is unknown. |
| `aso_knowledge_lookup` | `{ text }` | Best-fit topic for free-form text (a question, a metadata field, recommendation prose) or `{ match: null }` when nothing fits. |

## What's in the corpus

Twelve topics across the canonical ASO surface:

- **Title** — keyword weight, 30-char cap
- **Subtitle** — distinct keywords (don't repeat title)
- **Keyword field (iOS)** — comma-no-space format, no redundant terms
- **Description** — iOS not indexed for search, Android indexed
- **Screenshots** — captions are indexed by Apple's semantic search
- **Localization** — per-storefront metadata
- **Ratings** — ranking signal weight
- **Promotional text** — refreshable without App Review
- **Match granularity** — exact-phrase > scattered tokens

Every entry cites a **primary source**: Apple Human Interface Guidelines, Apple Search Ads docs, App Store Connect Help, Play Store Help, or the App Store Review Guidelines. Summaries paraphrase the source — never verbatim quotes. Third-party blogs and competing tool-vendor docs are explicitly excluded.

The corpus carries a stable `ASO_KNOWLEDGE_VERSION` fingerprint that bumps any time topics, summaries, or sources change.

## TypeScript surface

```ts
import {
  ASO_KNOWLEDGE_BASE,
  ASO_KNOWLEDGE_VERSION,
  inferKnowledgeTopic,
  getKnowledgeByTopic,
  listKnowledgeTopics,
  type KnowledgeEntry,
} from "@sniffy/aso-knowledge";
```

## Relationship to `@sniffy/mcp`

`@sniffy/mcp` returns paid ASO diagnoses; each `recommendations[]` item it emits already carries an optional `knowledge` citation drawn from this same corpus. This package gives agents the same citation library to query *outside* a diagnose call — for prep work, post-hoc explanations, or knowledge-only chats where no wallet is configured.

The two packages share their canonical data source (see the dual source-of-truth note at the top of `src/data.ts`). They are independently installable.

## License

MIT.
