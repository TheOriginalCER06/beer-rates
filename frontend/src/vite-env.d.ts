/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Server the Android/iOS app talks to (default https://xn--l-4ga.cer06.no, i.e. øl.cer06.no). */
  readonly VITE_SERVER_URL?: string
  /** Base URL of the docs site (default https://docs.xn--l-4ga.cer06.no). */
  readonly VITE_DOCS_URL?: string
  /** "true" when the Android build includes Firebase (google-services.json), so native push works. */
  readonly VITE_NATIVE_PUSH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
