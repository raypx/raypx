import { Button } from "@raypx/ui/components/button"
import { cn } from "@raypx/ui/lib/utils"
import { FingerprintIcon } from "lucide-react"
import { useContext } from "react"
import { useOnSuccessTransition } from "../../hooks/use-success-transition"
import { AuthContext } from "../../lib/auth-provider"
import { getLocalizedError } from "../../lib/utils"
import type { AuthLocalization } from "../../localization/auth-localization"
import type { AuthCardClassNames } from "./auth-card"

interface PasskeyButtonProps {
  classNames?: AuthCardClassNames
  isSubmitting?: boolean
  localization: Partial<AuthLocalization>
  redirectTo?: string
  setIsSubmitting?: (isSubmitting: boolean) => void
}

export function PasskeyButton({
  classNames,
  isSubmitting,
  localization,
  redirectTo,
  setIsSubmitting,
}: PasskeyButtonProps) {
  const {
    authClient,
    localization: contextLocalization,
    toast,
  } = useContext(AuthContext)

  localization = { ...contextLocalization, ...localization }

  const { onSuccess } = useOnSuccessTransition({ redirectTo })

  const signInPassKey = async () => {
    setIsSubmitting?.(true)

    try {
      const response = await authClient.signIn.passkey({
        fetchOptions: { throw: true },
      })

      if (response?.error) {
        toast({
          variant: "error",
          message: getLocalizedError({
            error: response.error,
            localization,
          }),
        })

        setIsSubmitting?.(false)
      } else {
        onSuccess()
      }
    } catch (error) {
      toast({
        variant: "error",
        message: getLocalizedError({ error, localization }),
      })

      setIsSubmitting?.(false)
    }
  }

  return (
    <Button
      className={cn(
        "w-full",
        classNames?.form?.button,
        classNames?.form?.secondaryButton,
      )}
      disabled={isSubmitting}
      formNoValidate
      name="passkey"
      value="true"
      variant="secondary"
      onClick={signInPassKey}
    >
      <FingerprintIcon />
      {localization.SIGN_IN_WITH} {localization.PASSKEY}
    </Button>
  )
}
