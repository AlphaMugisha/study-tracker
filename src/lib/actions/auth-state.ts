/**
 * Shared shape for the auth form actions.
 *
 * Kept out of `auth.ts` because a `"use server"` module may only export async
 * functions -- a plain `const` export there is a build error.
 */
export type AuthFormState = {
  /** Problem with the submission as a whole. */
  formError?: string;
  /** Keyed by input name. */
  fieldErrors?: Record<string, string>;
  /** Echoed back so a failed submit does not wipe what was typed. */
  values?: Record<string, string>;
  /** Success message shown in place of the form. */
  notice?: { title: string; body: string };
};

export const emptyAuthFormState: AuthFormState = {};
