import type { BetterFetchOption } from "@better-fetch/fetch";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth, useOnSuccessTransition } from "@raypx/auth";
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
import { useLocale } from "@raypx/ui/hooks/use-locale";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isValidEmail } from "../../utils/email";

function SignInPage() {
  const { t } = useLocale("auth");
  const { credentials, auth, navigate, redirectTo } = useAuth();
  const isHydrated = useIsHydrated();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { onSuccess } = useOnSuccessTransition({ redirectTo: redirectTo });

  const rememberMeEnabled = credentials?.rememberMe;
  const usernameEnabled = credentials?.username;
  const contextPasswordValidation = credentials?.passwordValidation;

  const formSchema = z.object({
    email: usernameEnabled
      ? z.string().min(1, {
          message: t("username.required"),
        })
      : z.email({
          message: t("email.invalid"),
        }),
    password: z
      .string()
      .min(1, {
        message: t("password.required"),
      })
      .min(8, {
        message: t("password.minLength", { min: 8 }),
      })
      .max(100, {
        message: t("password.maxLength", { max: 100 }),
      }),
    // .regex(/^(?=.*[A-Za-z])(?=.*\d)/, {
    //   message: t("password.regex"),
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
              <FormLabel>{usernameEnabled ? t("username.label") : t("email.label")}</FormLabel>

              <FormControl>
                <Input
                  autoComplete={usernameEnabled ? "username" : "email"}
                  disabled={isSubmitting}
                  placeholder={usernameEnabled ? t("username.placeholder") : t("email.placeholder")}
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
                <FormLabel>{t("password.label")}</FormLabel>

                {credentials?.forgotPassword && (
                  <Link
                    className="text-sm hover:underline"
                    href={`/forgot-password${isHydrated ? window.location.search : ""}`}
                  >
                    {t("forgotPassword")}
                  </Link>
                )}
              </div>

              <FormControl>
                <PasswordField
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  placeholder={t("password.placeholder")}
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

                <FormLabel>{t("rememberMeLabel")}</FormLabel>
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
          {isSubmitting ? <Loader2 className="animate-spin" /> : t("signIn.action")}
        </Button>
      </form>
    </Form>
  );
}

export const Route = createFileRoute("/_auth/sign-in")({
  component: SignInPage,
});
