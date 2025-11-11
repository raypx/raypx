import type { ReactNode } from "react";
import { useAuth } from "../hooks";

type SignedInProps = {
  children: ReactNode;
};

export function SignedIn({ children }: SignedInProps) {
  const {
    hooks: { useSession },
  } = useAuth();
  const session = useSession();
  if (!session.data) {
    return null;
  }
  return children;
}
