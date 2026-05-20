// Test-only re-export so test files can import a named helper without
// dotting through a `_internal` symbol at every callsite.
export { _internal_extractPopularity_forTests } from "../../../src/providers/apple/search-ads-popularity.js";
