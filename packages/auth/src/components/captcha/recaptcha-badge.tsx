import { useContext } from "react"
import { AuthContext } from "../../components/auth-provider"
import { useIsHydrated } from "../../hooks/use-hydrated"
import { cn } from "../../shared/utils"

export interface RecaptchaV3BadgeProps {
  className?: string
}

export function RecaptchaBadge({ className }: RecaptchaV3BadgeProps) {
  const isHydrated = useIsHydrated()
  const { captcha } = useContext(AuthContext)

  if (!captcha) return null

  if (!captcha.hideBadge) {
    return isHydrated ? (
      <style>{`
                .grecaptcha-badge { visibility: visible !important; }
            `}</style>
    ) : null
  }

  return (
    <>
      <style>{`
                .grecaptcha-badge { visibility: hidden; }
            `}</style>

      <p className={cn("text-muted-foreground text-xs", className)}>
        This site is protected by reCAPTCHA. By continuing, you agree to the
        Google{" "}
        <a
          className="text-foreground hover:underline"
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          Privacy Policy
        </a>{" "}
        &{" "}
        <a
          className="text-foreground hover:underline"
          href="https://policies.google.com/terms"
          target="_blank"
          rel="noreferrer"
        >
          Terms of Service
        </a>
        .
      </p>
    </>
  )
}
