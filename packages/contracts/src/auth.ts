import { z } from "zod";

/** Public account fields. Tokens and provider credentials never enter browser DTOs. */
export const sessionUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
});
export const sessionResponseSchema = z.object({ user: sessionUserSchema.nullable() });
export const currentUserResponseSchema = z.object({ user: sessionUserSchema });
export const signInSchema = z.object({ email: z.email(), password: z.string().min(8).max(128) });
export const signUpSchema = signInSchema.extend({ name: z.string().trim().min(1).max(128) });
/** Native auth responses are projected onto public account fields. */
export const authAccountResponseSchema = z.object({
  user: sessionUserSchema.extend({
    image: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
  }),
});
export const signOutResponseSchema = z.object({ success: z.literal(true) });
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
