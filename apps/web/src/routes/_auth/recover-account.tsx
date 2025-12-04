import { zodResolver } from "@hookform/resolvers/zod";
import { createSignInFormSchema, getSignInFormDefaults, useAuth, useSignIn } from "@raypx/auth";
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
import { AuthGuard } from "~/layouts/auth/auth-guard";
import { AuthCard } from "~/layouts/auth/card";

function RecoverAccountPage() {
  const { credentials, redirectTo } = useAuth();
  const isHydrated = useIsHydrated();
  const [isSubmitting] = useState(false);

  const rememberMeEnabled = credentials?.rememberMe;
  const usernameEnabled = credentials?.username;

  const formSchema = createSignInFormSchema({
    usernameEnabled,
    passwordValidation: { minLength: 8, maxLength: 100 },
    rememberMeEnabled,
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: getSignInFormDefaults(rememberMeEnabled),
  });

  const { signIn } = useSignIn({
    redirectTo,
    onError: () => {
      form.resetField("password");
      // resetCaptcha()
      // toast error handling
    },
  });

  return (
    <AuthGuard redirectTo={redirectTo || "/dashboard"}>
      <AuthCard
        description="Recover your account"
        footer={
          <>
            Don't have an account?{" "}
            <Link
              className="font-medium underline underline-offset-4 hover:text-primary"
              to="/sign-up"
            >
              Sign Up
            </Link>
          </>
        }
        title="Recover Account"
      >
        <Form {...form}>
          <form
            className={cn("grid w-full gap-6")}
            noValidate={isHydrated}
            onSubmit={form.handleSubmit(signIn)}
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
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>

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
              {isSubmitting ? <Loader2 className="animate-spin" /> : "Recover Account"}
            </Button>
          </form>
        </Form>
      </AuthCard>
    </AuthGuard>
  );
}

export const Route = createFileRoute("/_auth/recover-account")({
  component: RecoverAccountPage,
});
