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
import { signIn, signUp } from "@/lib/auth-client";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"github" | "google" | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (value.password !== value.confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }

      setIsLoading(true);
      try {
        const result = await signUp.email({
          name: value.name,
          email: value.email,
          password: value.password,
        });

        if (result.error) {
          toast.error(result.error.message || "Failed to create account");
          return;
        }

        toast.success("Account created! Please check your email to verify your account.");
        navigate({ to: "/login" });
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
          <CardTitle className="text-2xl">Create an account</CardTitle>
          <CardDescription>Enter your details to get started</CardDescription>
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
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <form.Field name="name">
                  {(field) => (
                    <>
                      <Input
                        disabled={isLoading}
                        id="name"
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="John Doe"
                        required
                        type="text"
                        value={field.state.value}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </>
                  )}
                </form.Field>
              </Field>

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
                        minLength={8}
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
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
                <form.Field name="confirmPassword">
                  {(field) => (
                    <>
                      <Input
                        disabled={isLoading}
                        id="confirmPassword"
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
              </Field>

              <Button className="w-full" disabled={isLoading} type="submit">
                {isLoading && <Spinner className="size-4" />}
                Create account
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
                Already have an account?{" "}
                <a className="text-primary hover:underline" href="/login">
                  Sign in
                </a>
              </p>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
