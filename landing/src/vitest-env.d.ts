/// <reference types="@testing-library/jest-dom" />
/// <reference types="vitest/globals" />

// Wires the @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveTextContent, etc.) into the global expect() type so component
// tests under src/**/*.test.tsx can use them without `tsc` complaining.
//
// Runtime registration happens in vitest.setup.ts.
