import type { BetterFetchOption } from "@better-fetch/fetch";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAnalytics } from "@raypx/analytics";
import {
  MagicLinkButton,
  ProviderButton,
  socialProviders,
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
  Separator,
} from "@raypx/ui/components";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isValidEmail } from "../../utils/email";
import { useAuthPageConfig } from "./-hooks/use-auth-page-config";

function SignInPage() {
  useAuthPageConfig({
    footerType: "sign-in",
  });

  const navigate = useNavigate();
  const { credentials, auth, redirectTo } = useAuth();
  const isHydrated = useIsHydrated();
  const [isSubmitting] = useState(false);
  const { onSuccess } = useOnSuccessTransition({ redirectTo: redirectTo });
  const analytics = useAnalytics();

  const rememberMeEnabled = credentials?.rememberMe;
  const usernameEnabled = credentials?.username;

  const formSchema = z.object({
    email: usernameEnabled
      ? z.string().min(1, {
          message: "Username is required",
        })
      : z.email({
          message: "Email is invalid",
        }),
    password: z
      .string()
      .min(1, {
        message: "Password is required",
      })
      .min(8, {
        message: "Password must be at least 8 characters",
      })
      .max(100, {
        message: "Password must be less than 100 characters",
      }),
    // .regex(/^(?=.*[A-Za-z])(?=.*\d)/, {
    //   message: "Password must contain at least one letter and one number",
    // })
    rememberMe: z.boolean().optional(),
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: !rememberMeEnabled,
    },
  });

  async function signIn({ email, password, rememberMe }: z.infer<typeof formSchema>) {
    try {
      let response: Record<string, unknown> = {};

      if (usernameEnabled && !isValidEmail(email)) {
        const fetchOptions: BetterFetchOption = {
          throw: true,
          // headers: await getCaptchaHeaders("/sign-in/username")
        };

        response = await auth.signIn.username({
          username: email,
          password,
          rememberMe,
          fetchOptions,
        });
      } else {
        const fetchOptions: BetterFetchOption = {
          throw: true,
          // headers: await getCaptchaHeaders("/sign-in/email")
        };

        response = await auth.signIn.email({
          email,
          password,
          rememberMe,
          fetchOptions,
        });
      }

      if (response.twoFactorRedirect) {
        // navigate(
        //     `${basePath}/${viewPaths.TWO_FACTOR}${window.location.search}`
        // )
        navigate({ to: "/" });
      } else {
        await onSuccess();
      }
    } catch (_error: unknown) {
      form.resetField("password");
      // resetCaptcha()

      // toast({
      //     variant: "error",
      //     message: getLocalizedError({ error, localization })
      // })
    }
  }

  return (
    <>
      {/* Social Login Buttons */}
      <div className="grid w-full gap-3">
        {socialProviders
          .filter((p) => p.provider === "github" || p.provider === "google")
          .map((provider) => (
            <ProviderButton
              disabled={isSubmitting}
              key={provider.provider}
              provider={provider}
              redirectTo={redirectTo}
            />
          ))}
      </div>

      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-xs text-muted-foreground">
          OR
        </span>
      </div>

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
            {isSubmitting ? <Loader2 className="animate-spin" /> : "Sign In"}
          </Button>

          <MagicLinkButton currentView="sign-in" disabled={isSubmitting} />
        </form>
      </Form>
    </>
  );
}

export const Route = createFileRoute("/_auth/sign-in")({
  head: () => ({
    meta: [{ title: "Sign In - Raypx", description: "Sign in to your account" }],
  }),
  component: SignInPage,
});
