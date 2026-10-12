/// <reference types="vite/client" />
// Type declarations for Vite environment variables used by FloodLens.

interface ImportMetaEnv {
  /**
   * OPTIONAL. URL of a server-side Copilot proxy (it holds the AI provider's secret key).
   * Never put an API key in a VITE_* variable — everything prefixed VITE_ is published in the browser bundle.
   */
  readonly VITE_COPILOT_ENDPOINT?: string;
}
