import '@testing-library/jest-dom'

// Ensure tests always use in-memory data
// (vite.config.ts reads this via import.meta.env in test mode)
// The .env.test file sets VITE_TEST_MODE=true — vitest loads it automatically.
