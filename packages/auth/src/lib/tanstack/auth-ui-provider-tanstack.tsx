import { useCallback, useMemo } from "react"
import { AuthProvider, type AuthProviderProps } from "../auth-provider"
import { useTanstackOptions } from "./use-tanstack-options"

export function AuthProviderTanstack({
  children,
  authClient,
  hooks: hooksProp,
  mutators: mutatorsProp,
  onSessionChange: onSessionChangeProp,
  ...props
}: AuthProviderProps) {
  const {
    hooks: contextHooks,
    mutators: contextMutators,
    onSessionChange,
    optimistic,
  } = useTanstackOptions({ authClient })

  const hooks = useMemo(
    () => ({ ...contextHooks, ...hooksProp }),
    [contextHooks, hooksProp],
  )
  const mutators = useMemo(
    () => ({ ...contextMutators, ...mutatorsProp }),
    [contextMutators, mutatorsProp],
  )

  const onSessionChangeCallback = useCallback(async () => {
    await onSessionChange()
    await onSessionChangeProp?.()
  }, [onSessionChangeProp, onSessionChange])

  return (
    <AuthProvider
      authClient={authClient}
      hooks={hooks}
      mutators={mutators}
      onSessionChange={onSessionChangeCallback}
      optimistic={optimistic}
      {...props}
    >
      {children}
    </AuthProvider>
  )
}
