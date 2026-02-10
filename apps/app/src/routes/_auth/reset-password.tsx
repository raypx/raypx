import { useAuth, useOnSuccessTransition } from "@raypx/auth";
import { Button, Field, FieldError, FieldLabel, PasswordField } from "@raypx/ui/components";
import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/alert";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { cn } from "@raypx/ui/lib/utils";
import { IconAlertCircle, IconLoader } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AuthCard } from "~/layouts/auth/card";
import { SuccessState } from "~/layouts/auth/success-state";

// Constants
const REDIRECT_DELAY = 3000; // 3 seconds
const LINK_EXPIRY_MINUTES = 15;

// Search params validation
const resetPasswordSearch = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
});

const passwordSchema = z
  .string()
  .min(1, { message: "Password is required" })
  .min(8, { message: "Password must be at least 8 characters" })
  .max(100, { message: "Password must be less than 100 characters" })
  .regex(/^(?=.*[a-z])(?=.*[A-Z])/, {
    message: "Password must contain at least one uppercase and one lowercase letter",
  })
  .regex(/^(?=.*\d)/, {
    message: "Password must contain at least one number",
  });

const formSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, { message: "Please confirm your password" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token, error: tokenError } = Route.useSearch();
  const { auth, redirectTo } = useAuth();
  const isHydrated = useIsHydrated();
  const { onSuccess } = useOnSuccessTransition({ redirectTo });

  const [isSuccess, setIsSuccess] = useState(false);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (!token) {
        toast.error("Error", {
          description: "Invalid reset token. Please request a new password reset link.",
        });
        return;
      }

      try {
        // Validate with Zod schema
        const validated = formSchema.parse(value);

        const response = await auth.resetPassword({
          newPassword: validated.password,
          token,
        });

        if (response.error) {
          toast.error("Reset Failed", {
            description:
              response.error.message ||
              "Failed to reset password. The link may have expired. Please try again.",
          });
          form.reset();
        } else {
          setIsSuccess(true);
          toast.success("Success!", {
            description: "Your password has been reset successfully.",
          });

          // Redirect to sign-in after delay
          redirectTimeoutRef.current = setTimeout(async () => {
            onSuccess();
            await navigate({ to: "/sign-in" });
          }, REDIRECT_DELAY);
        }
      } catch (error: any) {
        // Handle validation errors
        if (error?.issues) {
          // Zod validation errors are handled by field validators
          return;
        }
        // Handle API errors
        toast.error("Error", {
          description: "An unexpected error occurred. Please try again.",
        });
        form.reset();
      }
    },
  });

  // Check if token exists and show error if needed
  useEffect(() => {
    if (!token && !tokenError) {
      toast.error("Invalid Link", {
        description: "No reset token found. Please request a new password reset link.",
      });
    }

    if (tokenError) {
      toast.error("Invalid or Expired Link", {
        description:
          "This password reset link is invalid or has expired. Please request a new one.",
      });
    }

    // Cleanup timeout on unmount
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, [token, tokenError]);

  // Invalid token state
  if (!token || tokenError) {
    return (
      <AuthCard>
        <div className="grid w-full gap-6 text-center">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <IconAlertCircle className="h-8 w-8 text-destructive" />
            </div>

            <div className="space-y-2">
              <h2 className="font-bold text-2xl">Invalid Reset Link</h2>
              <p className="text-muted-foreground text-sm">
                This password reset link is invalid or has expired.
              </p>
            </div>
          </div>

          <Alert className="text-left">
            <IconAlertCircle className="h-4 w-4" />
            <AlertTitle>Possible reasons:</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>The link has expired (links expire after {LINK_EXPIRY_MINUTES} minutes)</li>
                <li>The link has already been used</li>
                <li>The link was copied incorrectly</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-3">
            <Link className="w-full" to="/forgot-password">
              <Button className="w-full">Request new reset link</Button>
            </Link>

            <Link className="w-full" to="/signin">
              <Button className="w-full" variant="outline">
                Back to sign in
              </Button>
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <AuthCard>
        <SuccessState
          description={
            <>
              Your password has been changed successfully.
              <br />
              Redirecting you to sign in...
            </>
          }
          title="Password Reset Successful!"
        >
          <Link className="w-full" to="/signin">
            <Button className="w-full">Continue to sign in</Button>
          </Link>
        </SuccessState>
      </AuthCard>
    );
  }

  // Reset form
  return (
    <AuthCard
      description="Choose a strong password for your account"
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
      title="Set new password"
    >
      <form
        className={cn("grid w-full gap-4")}
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
                <FieldLabel htmlFor={field.name}>New Password</FieldLabel>
                <PasswordField
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  disabled={form.state.isSubmitting}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Enter new password"
                  value={field.state.value}
                />
                <p className="mt-1 text-muted-foreground text-sm">
                  At least 8 characters with uppercase, lowercase, and numbers
                </p>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
          name="password"
          validators={{
            onChange: formSchema.shape.password,
          }}
        />

        <form.Field
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Confirm Password</FieldLabel>
                <PasswordField
                  aria-invalid={isInvalid}
                  autoComplete="new-password"
                  disabled={form.state.isSubmitting}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Confirm new password"
                  value={field.state.value}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
          name="confirmPassword"
          validators={{
            onChange: ({ value }) => {
              const passwordValue = form.state.values.password;
              if (!value) {
                return "Please confirm your password";
              }
              if (value !== passwordValue) {
                return "Passwords don't match";
              }
              return undefined;
            },
          }}
        />

        <Button className="w-full" disabled={form.state.isSubmitting} type="submit">
          {form.state.isSubmitting && <IconLoader className="mr-2 h-4 w-4 animate-spin" />}
          Reset password
        </Button>
      </form>
    </AuthCard>
  );
}

export const Route = createFileRoute("/_auth/reset-password")({
  head: () => ({
    meta: [
      {
        title: "Reset Password - Raypx",
        description: "Set a new password for your account",
      },
    ],
  }),
  validateSearch: resetPasswordSearch,
  component: ResetPasswordPage,
});
