import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@raypx/ui/components/field";
import { Input } from "@raypx/ui/components/input";
import { Spinner } from "@raypx/ui/components/spinner";
import { toast } from "@raypx/ui/components/toast";
import { IconBrandGithub, IconBrandGoogle } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"github" | "google" | null>(null);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
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
        navigate({ to: "/dashboard" });
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
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <form.Field name="email">
                  {(field) => (
                    <>
                      <Input
                        disabled={isLoading}
                        id="email"
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="you@example.com"
                        required
                        type="email"
                        value={field.state.value}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </>
                  )}
                </form.Field>
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <form.Field name="password">
                  {(field) => (
                    <>
                      <Input
                        disabled={isLoading}
                        id="password"
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="••••••••"
                        required
                        type="password"
                        value={field.state.value}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </>
                  )}
                </form.Field>
                <FieldDescription>
                  <a className="text-primary hover:underline" href="/forgot-password">
                    Forgot your password?
                  </a>
                </FieldDescription>
              </Field>

              <Button className="w-full" disabled={isLoading} type="submit">
                {isLoading && <Spinner className="size-4" />}
                Sign in
              </Button>

              <FieldSeparator>or continue with</FieldSeparator>

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
                    <IconBrandGithub className="size-4" />
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
                    <IconBrandGoogle className="size-4" />
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
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
