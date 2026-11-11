import '@tanstack/react-query';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** An i18n key (`namespace:key`) shown as a success toast when the mutation succeeds. */
      readonly successMessage?: string;
    };
  }
}
