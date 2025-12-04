import { zodResolver } from "@hookform/resolvers/zod";
import { createAuthRouteBeforeLoad, useAuth } from "@raypx/auth";
import { cn } from "@raypx/shared/utils";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@raypx/ui/components";
import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/alert";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/input-group";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard } from "~/layouts/auth/card";
import { SuccessState } from "~/layouts/auth/success-state";

const emailFormSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Please enter a valid email address" }),
});

type EmailFormValues = z.infer<typeof emailFormSchema>;

function ForgotPasswordPage() {
  const { auth, redirectTo } = useAuth();
  const [emailSent, setEmailSent] = useState(false);
  const isHydrated = useIsHydrated();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit({ email }: EmailFormValues) {
    setIsSubmitting(true);

    try {
      // Use requestPasswordReset to send reset password link
      const response = await auth.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (response.error) {
        toast.error("Error", {
          description: response.error.message || "Failed to send reset email. Please try again.",
        });
      } else {
        setEmailSent(true);
        setSubmittedEmail(email);
        emailForm.reset();
        toast.success("Email Sent", {
          description: "Please check your email for the password reset link.",
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

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
            <Mail className="h-4 w-4" />
            <AlertTitle>Didn't receive the email?</AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc space-y-1 mt-2">
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
                emailForm.setValue("email", submittedEmail);
              }}
              variant="outline"
            >
              Send another email
            </Button>

            <Link className="w-full" to="/sign-in">
              <Button className="w-full" variant="ghost">
                <ArrowLeft className="mr-2 h-4 w-4" />
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
            to="/sign-in"
          >
            Sign in
          </Link>
        </>
      }
      title="Forgot your password?"
    >
      <Form {...emailForm}>
        <form
          className={cn("grid w-full gap-4")}
          noValidate={isHydrated}
          onSubmit={emailForm.handleSubmit(onSubmit)}
        >
          <FormField
            control={emailForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <InputGroup>
                    <InputGroupAddon>
                      <Mail className="h-4 w-4" />
                    </InputGroupAddon>
                    <InputGroupInput
                      autoComplete="email"
                      disabled={isSubmitting}
                      placeholder="name@example.com"
                      type="email"
                      {...field}
                    />
                  </InputGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send reset link
          </Button>
        </form>
      </Form>

      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
        <AlertCircle className="h-4 w-4" />
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
  beforeLoad: createAuthRouteBeforeLoad("/dashboard"),
  component: ForgotPasswordPage,
});
