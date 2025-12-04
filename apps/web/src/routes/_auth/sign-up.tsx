import { zodResolver } from "@hookform/resolvers/zod";
import {
  createSignUpFormSchema,
  getSignInFormDefaults,
  useAuth,
  useOnSuccessTransition,
} from "@raypx/auth";
import { cn } from "@raypx/shared/utils";
import {
  Button,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  PasswordField,
} from "@raypx/ui/components";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { AuthGuard } from "~/layouts/auth/auth-guard";
import { AuthCard } from "~/layouts/auth/card";
import { OrDivider } from "~/layouts/auth/or-divider";
import { SocialProviders } from "~/layouts/auth/social-providers";

function SignUpPage() {
  const { credentials, auth, redirectTo } = useAuth();
  const isHydrated = useIsHydrated();
  const [isSubmitting] = useState(false);
  const { onSuccess } = useOnSuccessTransition({ redirectTo: redirectTo });

  const rememberMeEnabled = credentials?.rememberMe;
  const usernameEnabled = credentials?.username;

  const formSchema = createSignUpFormSchema({
    usernameEnabled,
    passwordValidation: { minLength: 8, maxLength: 100 },
    rememberMeEnabled,
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: getSignInFormDefaults(rememberMeEnabled),
  });

  async function signUp({ email, password }: z.infer<typeof formSchema>) {
    try {
      const response = await auth.signUp.email({
        email,
        password,
        name: "",
        fetchOptions: { throw: true },
      });

      if ("token" in response && response.token) {
        await onSuccess();
      } else {
        // Email verification required - redirect to sign-in
        // toast: Please check your email to verify your account
      }
    } catch (_error) {
      form.resetField("password");
      // toast: Sign up failed
    }
  }

  return (
    <AuthGuard redirectTo={redirectTo || "/dashboard"}>
      <AuthCard
        description="Create an account"
        footer={
          <>
            Already have an account?{" "}
            <Link
              className="font-medium underline underline-offset-4 hover:text-primary"
              to="/sign-in"
            >
              Sign In
            </Link>
          </>
        }
        title="Sign Up"
      >
        <SocialProviders disabled={isSubmitting} redirectTo={redirectTo} />

        <OrDivider />

        <Form {...form}>
          <form
            className={cn("grid w-full gap-6")}
            noValidate={isHydrated}
            onSubmit={form.handleSubmit(signUp)}
          >
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{usernameEnabled ? "Username" : "Email"}</FormLabel>

                  <FormControl>
                    <Input
                      autoComplete={usernameEnabled ? "username" : "email"}
                      disabled={isSubmitting}
                      placeholder={usernameEnabled ? "Username" : "Email"}
                      type={usernameEnabled ? "text" : "email"}
                      {...field}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <PasswordField
                      autoComplete="current-password"
                      disabled={isSubmitting}
                      placeholder="Password"
                      {...field}
                    />
                  </FormControl>

                  <FormMessage />
                </FormItem>
              )}
            />

            {rememberMeEnabled && (
              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem className="flex">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        disabled={isSubmitting}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>

                    <FormLabel>Remember Me</FormLabel>
                  </FormItem>
                )}
              />
            )}

            {/* <Captcha
                    action="/sign-in/email"
                    localization={localization}
                    ref={captchaRef}
                /> */}

            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? <Loader2 className="animate-spin" /> : "Sign Up"}
            </Button>
          </form>
        </Form>
      </AuthCard>
    </AuthGuard>
  );
}

export const Route = createFileRoute("/_auth/sign-up")({
  head: () => ({
    meta: [{ title: "Sign Up - Raypx", description: "Create an account" }],
  }),
  component: SignUpPage,
});
