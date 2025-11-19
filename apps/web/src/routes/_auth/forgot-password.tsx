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
  Input,
} from "@raypx/ui/components";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { useToast } from "@raypx/ui/hooks/use-toast";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuthPageConfig } from "./-hooks/use-auth-page-config";

const formSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Please enter a valid email address" }),
});

type FormValues = z.infer<typeof formSchema>;

function ForgotPasswordPage() {
  useAuthPageConfig({
    footerType: "sign-in",
  });

  const { auth } = useAuth();
  const { toast } = useToast();
  const isHydrated = useIsHydrated();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
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
      const response = await auth.forgetPassword({
        email,
        redirectTo: "/reset-password",
      });

      if (response.error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: response.error.message || "Failed to send reset email. Please try again.",
        });
      } else {
        setEmailSent(true);
        setSubmittedEmail(email);
        form.reset();
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again later.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (emailSent) {
    return (
      <div className="grid w-full gap-6 text-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Check your email</h2>
            <p className="text-sm text-muted-foreground">We've sent a password reset link to:</p>
            <p className="text-sm font-medium">{submittedEmail}</p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex gap-3">
            <Mail className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <div className="space-y-1 text-left text-sm">
              <p className="font-medium">Didn't receive the email?</p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li>Check your spam or junk folder</li>
                <li>Make sure {submittedEmail} is correct</li>
                <li>Wait a few minutes for the email to arrive</li>
              </ul>
            </div>
          </div>
        </div>

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
      </div>
    );
  }

  return (
    <div className="grid w-full gap-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          No worries! Enter your email and we'll send you a reset link.
        </p>
      </div>

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
                  <Input
                    autoComplete="email"
                    disabled={isSubmitting}
                    placeholder="name@example.com"
                    type="email"
                    {...field}
                  />
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

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
        <div className="flex gap-2 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-200">
            The reset link will expire in <strong>15 minutes</strong>
          </p>
        </div>
      </div>

      <div className="text-center text-sm">
        Remember your password?{" "}
        <Link className="font-medium underline underline-offset-4 hover:text-primary" to="/sign-in">
          Sign in
        </Link>
      </div>
    </div>
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
