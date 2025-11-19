import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth, useOnSuccessTransition } from "@raypx/auth";
import { cn } from "@raypx/shared/utils";
import {
  Button,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  PasswordField,
} from "@raypx/ui/components";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { useToast } from "@raypx/ui/hooks/use-toast";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuthPageConfig } from "./-hooks/use-auth-page-config";

// Search params validation
const resetPasswordSearch = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
});

type ResetPasswordSearch = z.infer<typeof resetPasswordSearch>;

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

type FormValues = z.infer<typeof formSchema>;

function ResetPasswordPage() {
  useAuthPageConfig({
    footerType: "sign-in",
  });

  const navigate = useNavigate();
  const { token, error: tokenError } = Route.useSearch();
  const { auth, redirectTo } = useAuth();
  const { toast } = useToast();
  const isHydrated = useIsHydrated();
  const { onSuccess } = useOnSuccessTransition({ redirectTo });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Check if token exists
  useEffect(() => {
    if (!token && !tokenError) {
      toast({
        variant: "destructive",
        title: "Invalid Link",
        description: "No reset token found. Please request a new password reset link.",
      });
    }

    if (tokenError) {
      toast({
        variant: "destructive",
        title: "Invalid or Expired Link",
        description:
          "This password reset link is invalid or has expired. Please request a new one.",
      });
    }
  }, [token, tokenError, toast]);

  async function onSubmit({ password }: FormValues) {
    if (!token) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Invalid reset token. Please request a new password reset link.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await auth.resetPassword({
        newPassword: password,
        token,
      });

      if (response.error) {
        toast({
          variant: "destructive",
          title: "Reset Failed",
          description:
            response.error.message ||
            "Failed to reset password. The link may have expired. Please try again.",
        });
      } else {
        setIsSuccess(true);
        toast({
          title: "Success!",
          description: "Your password has been reset successfully.",
        });

        // Redirect to sign-in after 3 seconds
        setTimeout(async () => {
          await navigate({ to: "/sign-in" });
        }, 3000);
      }
    } catch (error) {
      console.error("Reset password error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Invalid token state
  if (!token || tokenError) {
    return (
      <div className="grid w-full gap-6 text-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Invalid Reset Link</h2>
            <p className="text-sm text-muted-foreground">
              This password reset link is invalid or has expired.
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="space-y-2 text-left text-sm">
            <p className="font-medium">Possible reasons:</p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              <li>The link has expired (links expire after 15 minutes)</li>
              <li>The link has already been used</li>
              <li>The link was copied incorrectly</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link className="w-full" to="/forgot-password">
            <Button className="w-full">Request new reset link</Button>
          </Link>

          <Link className="w-full" to="/sign-in">
            <Button className="w-full" variant="outline">
              Back to sign in
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="grid w-full gap-6 text-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Password Reset Successful!</h2>
            <p className="text-sm text-muted-foreground">
              Your password has been changed successfully.
              <br />
              Redirecting you to sign in...
            </p>
          </div>
        </div>

        <Link className="w-full" to="/sign-in">
          <Button className="w-full">Continue to sign in</Button>
        </Link>
      </div>
    );
  }

  // Reset form
  return (
    <div className="grid w-full gap-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Set new password</h1>
        <p className="text-sm text-muted-foreground">Choose a strong password for your account</p>
      </div>

      <Form {...form}>
        <form
          className={cn("grid w-full gap-4")}
          noValidate={isHydrated}
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <PasswordField
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    placeholder="Enter new password"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  At least 8 characters with uppercase, lowercase, and numbers
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <PasswordField
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    placeholder="Confirm new password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reset password
          </Button>
        </form>
      </Form>

      <div className="text-center text-sm">
        Remember your password?{" "}
        <Link className="font-medium underline underline-offset-4 hover:text-primary" to="/sign-in">
          Sign in
        </Link>
      </div>
    </div>
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
