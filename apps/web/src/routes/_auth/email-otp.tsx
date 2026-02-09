import { createSignInFormSchema, useAuth, useSignIn } from "@raypx/auth";
import {
  Button,
  Checkbox,
  Field,
  FieldError,
  FieldLabel,
  Input,
  PasswordField,
} from "@raypx/ui/components";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { cn } from "@raypx/ui/lib/utils";
import { IconLoader } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGuard } from "~/layouts/auth/auth-guard";
import { AuthCard } from "~/layouts/auth/card";

function EmailOtpPage() {
  const { credentials, redirectTo } = useAuth();
  const isHydrated = useIsHydrated();

  const rememberMeEnabled = credentials?.rememberMe;
  const usernameEnabled = credentials?.username;

  const formSchema = createSignInFormSchema({
    usernameEnabled,
    passwordValidation: { minLength: 8, maxLength: 100 },
    rememberMeEnabled,
  });

  const { signIn } = useSignIn({
    redirectTo,
    onError: (error: any) => {
      const errorMessage = error?.message || "Sign in failed. Please try again.";
      toast.error(errorMessage);
      console.error("Sign in error:", error);
    },
  });

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
    onSubmit: async ({ value }) => {
      try {
        // Validate with Zod schema
        const validated = formSchema.parse(value);

        await signIn({
          email: validated.email,
          password: validated.password,
          rememberMe: validated.rememberMe,
        });
      } catch (error: any) {
        // Handle validation errors
        if (error?.issues) {
          // Zod validation errors are handled by field validators
          return;
        }
        // Other errors are handled by useSignIn's onError
        throw error;
      }
    },
  });

  return (
    <AuthGuard redirectTo={redirectTo || "/dashboard"}>
      <AuthCard
        description="Sign in with email and one-time password"
        footer={
          <>
            Don't have an account?{" "}
            <Link
              className="font-medium underline underline-offset-4 hover:text-primary"
              to="/signup"
            >
              Sign Up
            </Link>
          </>
        }
        title="Email OTP"
      >
        <form
          className={cn("grid w-full gap-6")}
          noValidate={isHydrated}
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    {usernameEnabled ? "Username" : "Email"}
                  </FieldLabel>
                  <Input
                    autoComplete={usernameEnabled ? "username" : "email"}
                    disabled={form.state.isSubmitting}
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder={usernameEnabled ? "Username" : "Email"}
                    type={usernameEnabled ? "text" : "email"}
                    value={field.state.value}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
            name="email"
            validators={{
              onChange: formSchema.shape.email,
            }}
          />

          <form.Field
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>

                    {credentials?.forgotPassword && (
                      <Link
                        className="text-sm hover:underline"
                        search={isHydrated ? window.location.search : ""}
                        to="/forgot-password"
                      >
                        Forgot Password
                      </Link>
                    )}
                  </div>
                  <PasswordField
                    aria-invalid={isInvalid}
                    autoComplete="current-password"
                    disabled={form.state.isSubmitting}
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Password"
                    value={field.state.value}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
            name="password"
            validators={{
              onChange: formSchema.shape.password,
            }}
          />

          {rememberMeEnabled && (
            <form.Field name="rememberMe">
              {(field) => (
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={field.state.value}
                    disabled={form.state.isSubmitting}
                    id={field.name}
                    onCheckedChange={(checked) => field.handleChange(checked === true)}
                  />
                  <label
                    className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    htmlFor={field.name}
                  >
                    Remember Me
                  </label>
                </div>
              )}
            </form.Field>
          )}

          <Button className="w-full" disabled={form.state.isSubmitting} type="submit">
            {form.state.isSubmitting ? <IconLoader className="animate-spin" /> : "Email OTP"}
          </Button>
        </form>
      </AuthCard>
    </AuthGuard>
  );
}

export const Route = createFileRoute("/_auth/email-otp")({
  head: () => ({
    meta: [{ title: "Email OTP", description: "Sign in with an email OTP" }],
  }),
  component: EmailOtpPage,
});
