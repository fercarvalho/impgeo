/// <reference types="vite/client" />

// Explicit ImportMetaEnv declarations so typos in VITE_* variable names
// are caught at compile time instead of silently evaluating to undefined.
// `interface ImportMeta` is already declared by vite/client — do not re-declare it.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEMO_MODE?: string;
}
