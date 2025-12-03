import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@raypx/auth";
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
import { AuthCard } from "~/layouts/auth/auth-card";
import { ForgotPasswordFooter } from "~/layouts/auth/auth-footers";
import { AuthSuccessState } from "~/layouts/auth/auth-success-state";

const formSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Please enter a valid email address" }),
});

type FormValues = z.infer<typeof formSchema>;

function ForgotPasswordPage() {
  const { auth } = useAuth();
  const [emailSent, setEmailSent] = useState(false);
  const isHydrated = useIsHydrated();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit({ email }: FormValues) {
    setIsSubmitting(true);

    try {
      const response = await auth.forgetPassword.emailOtp({
        email,
      });

      if (response.error) {
        toast.error("Error", {
          description: response.error.message || "Failed to send reset email. Please try again.",
        });
      } else {
        setEmailSent(true);
        setSubmittedEmail(email);
        form.reset();
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      toast.error("Error", {
        description: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (emailSent) {
    return (
      <AuthCard>
        <AuthSuccessState
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
                form.setValue("email", submittedEmail);
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
        </AuthSuccessState>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      description="No worries! Enter your email and we'll send you a reset link."
      footer={<ForgotPasswordFooter />}
      title="Forgot your password?"
    >
      <Form {...form}>
        <form
          className={cn("grid w-full gap-4")}
          noValidate={isHydrated}
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
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
  component: ForgotPasswordPage,
});
