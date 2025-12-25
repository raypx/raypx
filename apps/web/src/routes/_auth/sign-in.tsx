import { zodResolver } from "@hookform/resolvers/zod";
import {
  createAuthRouteBeforeLoad,
  createSignInFormSchema,
  getSignInFormDefaults,
  MagicLinkButton,
  useAuth,
  useSignIn,
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
import { IconLoader2 } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthCard } from "~/layouts/auth/card";
import { OrDivider } from "~/layouts/auth/or-divider";
import { SocialProviders } from "~/layouts/auth/social-providers";

function SignInPage() {
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
    <AuthCard
      description="Sign in to your account"
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
      title="Sign In"
    >
      <SocialProviders disabled={isSubmitting} redirectTo={redirectTo} />

      <OrDivider />

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

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? <IconLoader2 className="animate-spin" /> : "Sign In"}
          </Button>

          <MagicLinkButton currentView="sign-in" disabled={isSubmitting} />
        </form>
      </Form>
    </AuthCard>
  );
}

export const Route = createFileRoute("/_auth/sign-in")({
  head: () => ({
    meta: [{ title: "Sign In - Raypx", description: "Sign in to your account" }],
  }),
  beforeLoad: createAuthRouteBeforeLoad("/dashboard"),
  component: SignInPage,
});
