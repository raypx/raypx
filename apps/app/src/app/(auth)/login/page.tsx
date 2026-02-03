"use client";

import { GithubLogoIcon, GoogleLogoIcon } from "@phosphor-icons/react";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Input } from "@raypx/ui/components/input";
import { Spinner } from "@raypx/ui/components/spinner";
import { toast } from "@raypx/ui/components/toast";
import { cn } from "@raypx/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod/v4";
import { signIn } from "@/lib/auth-client";

const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"github" | "google" | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    } satisfies LoginFormValues,
    onSubmit: async ({ value }) => {
      setIsLoading(true);
      try {
        const result = await signIn.email({
          email: value.email,
          password: value.password,
        });

        if (result.error) {
          toast.error(result.error.message || "Failed to sign in");
          return;
        }

        toast.success("Signed in successfully");
        router.push("/dashboard");
      } catch {
        toast.error("An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    },
  });

  const handleSocialLogin = async (provider: "github" | "google") => {
    setSocialLoading(provider);
    try {
      await signIn.social({
        provider,
        callbackURL: "/dashboard",
      });
    } catch {
      toast.error(`Failed to sign in with ${provider}`);
      setSocialLoading(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.Field
              name="email"
              validators={{
                onChange: ({ value }) => {
                  const result = z.string().email().safeParse(value);
                  if (!result.success) {
                    return result.error.issues[0]?.message || "Invalid email";
                  }
                },
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <label
                    className={cn(
                      "font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                      field.state.meta.errors.length > 0 && "text-destructive",
                    )}
                    htmlFor={field.name}
                  >
                    Email
                  </label>
                  <Input
                    disabled={isLoading}
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="you@example.com"
                    type="email"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-destructive text-sm">{field.state.meta.errors[0]}</p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onChange: ({ value }) => {
                  if (!value) {
                    return "Password is required";
                  }
                },
              }}
            >
              {(field) => (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label
                      className={cn(
                        "font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                        field.state.meta.errors.length > 0 && "text-destructive",
                      )}
                      htmlFor={field.name}
                    >
                      Password
                    </label>
                    <a className="text-primary text-sm hover:underline" href="/forgot-password">
                      Forgot your password?
                    </a>
                  </div>
                  <Input
                    disabled={isLoading}
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="••••••••"
                    type="password"
                    value={field.state.value}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-destructive text-sm">{field.state.meta.errors[0]}</p>
                  )}
                </div>
              )}
            </form.Field>

            <Button className="w-full" disabled={isLoading} type="submit">
              {isLoading && <Spinner className="size-4" />}
              Sign in
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                disabled={socialLoading !== null}
                onClick={() => handleSocialLogin("github")}
                type="button"
                variant="outline"
              >
                {socialLoading === "github" ? (
                  <Spinner className="size-4" />
                ) : (
                  <GithubLogoIcon className="size-4" />
                )}
                GitHub
              </Button>
              <Button
                disabled={socialLoading !== null}
                onClick={() => handleSocialLogin("google")}
                type="button"
                variant="outline"
              >
                {socialLoading === "google" ? (
                  <Spinner className="size-4" />
                ) : (
                  <GoogleLogoIcon className="size-4" />
                )}
                Google
              </Button>
            </div>

            <p className="text-center text-muted-foreground text-sm">
              Don't have an account?{" "}
              <a className="text-primary hover:underline" href="/signup">
                Sign up
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
