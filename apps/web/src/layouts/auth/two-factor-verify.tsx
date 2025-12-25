import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@raypx/auth";
import { cn } from "@raypx/shared/utils";
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@raypx/ui/components";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@raypx/ui/components/input-otp";
import { toast } from "@raypx/ui/components/toast";
import { useIsHydrated } from "@raypx/ui/hooks/use-hydrated";
import { IconLoader2 } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

const twoFactorSchema = z.object({
  code: z.string().length(6, { message: "Code must be 6 digits" }),
});

type TwoFactorVerifyProps = {
  onSuccess?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
  title?: string;
  description?: string;
  className?: string;
};

export function TwoFactorVerify({
  onSuccess,
  onError,
  title = "Two-Factor Authentication",
  description = "Enter the 6-digit code from your authenticator app",
  className,
}: TwoFactorVerifyProps) {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const isHydrated = useIsHydrated();

  const form = useForm<z.infer<typeof twoFactorSchema>>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: {
      code: "",
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit({ code }: z.infer<typeof twoFactorSchema>) {
    try {
      const response = await auth.twoFactor.verify({
        code,
        fetchOptions: { throw: true },
      });

      if (response.error) {
        const errorMessage = response.error.message?.toLowerCase() || "";

        // If verification fails due to missing 2FA challenge (user didn't complete first login step),
        // redirect to sign-in to prevent bypassing the login flow
        if (
          errorMessage.includes("challenge") ||
          errorMessage.includes("session") ||
          errorMessage.includes("unauthorized") ||
          errorMessage.includes("invalid") ||
          errorMessage.includes("expired")
        ) {
          toast.error("Session Expired", {
            description: "Please sign in again to continue.",
          });
          // Redirect to sign-in after a short delay
          setTimeout(async () => {
            await navigate({ to: "/sign-in", replace: true });
          }, 1500);
          onError?.(response.error);
          return;
        }

        // Other errors (like invalid code) - just show error, don't redirect
        toast.error("Verification Failed", {
          description: response.error.message || "Invalid code. Please try again.",
        });
        form.resetField("code");
        onError?.(response.error);
      } else {
        toast.success("Verified", {
          description: "Two-factor authentication verified successfully.",
        });
        await onSuccess?.();
      }
    } catch (error) {
      // Handle network errors or other exceptions
      const errorMessage =
        error && typeof error === "object" && "message" in error
          ? String(error.message).toLowerCase()
          : "";

      // If it's a session/challenge related error, redirect to sign-in
      if (
        errorMessage.includes("challenge") ||
        errorMessage.includes("session") ||
        errorMessage.includes("unauthorized") ||
        errorMessage.includes("network")
      ) {
        toast.error("Session Expired", {
          description: "Please sign in again to continue.",
        });
        setTimeout(async () => {
          await navigate({ to: "/sign-in", replace: true });
        }, 1500);
        onError?.(error);
        return;
      }

      toast.error("Error", {
        description: "An unexpected error occurred. Please try again.",
      });
      form.resetField("code");
      onError?.(error);
    }
  }

  return (
    <div className={cn("grid w-full gap-6", className)}>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      <Form {...form}>
        <form
          className={cn("grid w-full gap-4")}
          noValidate={isHydrated}
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verification Code</FormLabel>
                <FormControl>
                  <InputOTP
                    disabled={isSubmitting}
                    maxLength={6}
                    name={field.name}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    onComplete={(value) => {
                      field.onChange(value);
                      // Auto-submit when code is complete
                      form.handleSubmit(onSubmit)();
                    }}
                    value={field.value ?? ""}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify Code
          </Button>
        </form>
      </Form>
    </div>
  );
}
