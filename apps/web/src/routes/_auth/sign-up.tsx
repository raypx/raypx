import type { BetterFetchOption } from "@better-fetch/fetch";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout, useAuth, useOnSuccessTransition } from "@raypx/auth";
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
import { z } from "zod";
import { isValidEmail } from "../../utils/email";

function SignUpPage() {
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
      } else {
        await onSuccess();
      }
    } catch (error) {
      form.resetField("password");
      // resetCaptcha()

      // toast({
      //     variant: "error",
      //     message: getLocalizedError({ error, localization })
      // })
    }
  }

  return (
    <AuthLayout
      cardFooter={
        <>
          Already have an account?
          <Link className={cn("text-foreground underline")} to="/sign-in">
            <Button className={cn("px-0 text-foreground underline")} size="sm" variant="link">
              Sign In
            </Button>
          </Link>
        </>
      }
      description="Create an account"
      title="Sign Up"
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
    </AuthLayout>
  );
}

export const Route = createFileRoute("/_auth/sign-up")({
  component: SignUpPage,
});
