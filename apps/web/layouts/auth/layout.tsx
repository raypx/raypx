import type { ReactNode } from "react"
import { Suspense } from "react"
import { GuestGuard } from "../../app/(auth)/_components/guest-guard"

interface AuthLayoutProps {
  children: ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      {children}
      <Suspense>
        <GuestGuard />
      </Suspense>
    </>
  )
}
