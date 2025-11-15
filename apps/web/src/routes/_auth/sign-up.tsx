import type { BetterFetchOption } from "@better-fetch/fetch";
import { zodResolver } from "@hookform/resolvers/zod";
import { ProviderButton, socialProviders, useAuth, useOnSuccessTransition } from "@raypx/auth";
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
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuthPageConfig } from "./-hooks/use-auth-page-config";

function SignUpPage() {
  useAuthPageConfig({
    footerType: "sign-up",
  });

  const { credentials, auth, redirectTo } = useAuth();
  const isHydrated = useIsHydrated();
  const [isSubmitting] = useState(false);
  const { onSuccess } = useOnSuccessTransition({ redirectTo: redirectTo });

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

  async function signUp({ email, password }: z.infer<typeof formSchema>) {
    try {
      const fetchOptions: BetterFetchOption = {
        throw: true,
      };

      const response = await auth.signUp.email({
        email,
        password,
        name: "",
        fetchOptions,
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
    </>
  );
}

export const Route = createFileRoute("/_auth/sign-up")({
  head: () => ({
    meta: [{ title: "Sign Up - Raypx", description: "Create an account" }],
  }),
  component: SignUpPage,
});
