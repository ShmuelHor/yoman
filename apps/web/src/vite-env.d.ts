/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `off` makes `vite dev` skip MSW and call a real local gateway. */
  readonly VITE_MOCKS?: string;
}
