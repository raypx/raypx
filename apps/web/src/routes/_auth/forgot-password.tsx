import { useAuth } from "@raypx/auth";
import { Button, Field, FieldError, FieldLabel } from "@raypx/ui/components";
import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/alert";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/input-group";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { cn } from "@raypx/ui/lib/utils";
import { IconAlertCircle, IconArrowLeft, IconLoader, IconMail } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthCard } from "~/layouts/auth/card";
import { SuccessState } from "~/layouts/auth/success-state";

const emailFormSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Please enter a valid email address" }),
});

function ForgotPasswordPage() {
  const { auth } = useAuth();
  const [emailSent, setEmailSent] = useState(false);
  const isHydrated = useIsHydrated();
  const [submittedEmail, setSubmittedEmail] = useState("");

  const emailForm = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      try {
        // Validate with Zod schema
        const validated = emailFormSchema.parse(value);

        // Use requestPasswordReset to send reset password link
        const response = await auth.requestPasswordReset({
          email: validated.email,
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (response.error) {
          toast.error("Error", {
            description: response.error.message || "Failed to send reset email. Please try again.",
          });
        } else {
          setEmailSent(true);
          setSubmittedEmail(validated.email);
          emailForm.reset();
          toast.success("Email Sent", {
            description: "Please check your email for the password reset link.",
          });
        }
      } catch (error: any) {
        // Handle validation errors
        if (error?.issues) {
          // Zod validation errors are handled by field validators
          return;
        }
        // Handle API errors
        toast.error("Error", {
          description: "An unexpected error occurred. Please try again later.",
        });
      }
    },
  });

  // Success state - email sent
  if (emailSent) {
    return (
      <AuthCard>
        <SuccessState
          description={
            <>
              We've sent a password reset link to{" "}
              <span className="font-medium text-foreground">{submittedEmail}</span>
            </>
          }
          title="Check your email"
        >
          <Alert className="text-left">
            <IconMail className="h-4 w-4" />
            <AlertTitle>Didn't receive the email?</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>Check your spam or junk folder</li>
                <li>Make sure the email address is correct</li>
                <li>Wait a few minutes for the email to arrive</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => {
                setEmailSent(false);
                emailForm.setFieldValue("email", submittedEmail);
              }}
              variant="outline"
            >
              Send another email
            </Button>

            <Link className="w-full" to="/signin">
              <Button className="w-full" variant="ghost">
                <IconArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Button>
            </Link>
          </div>
        </SuccessState>
      </AuthCard>
    );
  }

  // Email input step
  return (
    <AuthCard
      description="No worries! Enter your email and we'll send you a reset link."
      footer={
        <>
          Remember your password?{" "}
          <Link
            className="font-medium underline underline-offset-4 hover:text-primary"
            to="/signin"
          >
            Sign in
          </Link>
        </>
      }
      title="Forgot your password?"
    >
      <form
        className={cn("grid w-full gap-4")}
        noValidate={isHydrated}
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          emailForm.handleSubmit();
        }}
      >
        <emailForm.Field
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <IconMail className="h-4 w-4" />
                  </InputGroupAddon>
                  <InputGroupInput
                    autoComplete="email"
                    disabled={emailForm.state.isSubmitting}
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    value={field.state.value}
                  />
                </InputGroup>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
          name="email"
          validators={{
            onChange: emailFormSchema.shape.email,
          }}
        />

        <Button className="w-full" disabled={emailForm.state.isSubmitting} type="submit">
          {emailForm.state.isSubmitting && <IconLoader className="mr-2 h-4 w-4 animate-spin" />}
          Send reset link
        </Button>
      </form>

      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
        <IconAlertCircle className="h-4 w-4" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">Important</AlertTitle>
        <AlertDescription className="block text-amber-800 dark:text-amber-200">
          The reset link will expire in <strong>15 minutes</strong>
        </AlertDescription>
      </Alert>
    </AuthCard>
  );
}

export const Route = createFileRoute("/_auth/forgot-password")({
  head: () => ({
    meta: [
      {
        title: "Forgot Password - Raypx",
        description:
          "Forgot your password? No problem. Just enter your email and we'll send you a reset link.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});
