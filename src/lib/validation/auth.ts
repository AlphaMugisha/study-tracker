import { z } from "zod";

/**
 * Validation for the auth forms.
 *
 * The server is the only authority -- the browser gets `type="email"`,
 * `required` and `minlength` for instant feedback, but every submission is
 * re-validated here before it reaches Supabase.
 *
 * Messages are written to be read by a stressed sixteen-year-old, not by a
 * developer: say what to do, not what went wrong.
 */

const PASSWORD_MIN = 8;
/** bcrypt truncates past 72 bytes; Supabase rejects longer. */
const PASSWORD_MAX = 72;

const email = z.email("Enter a valid email address, like ava@school.com.");

const password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Keep it under ${PASSWORD_MAX} characters.`);

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .min(2, "Tell us your name.")
      .max(80, "That name is a little too long."),
    email,
    password,
    confirmPassword: z.string().min(1, "Type your password again."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Both passwords need to match.",
  });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, "Type your password again."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Both passwords need to match.",
  });

/**
 * First message per field. Built from `issues` by hand rather than via
 * `flatten()` / `flattenError()` so it is not tied to a Zod major version.
 */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }

  return errors;
}

export { PASSWORD_MIN };
