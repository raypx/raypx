import { useAuth } from "../hooks";

type SignedOutProps = {
  children: React.ReactNode;
};

export function SignedOut({ children }: SignedOutProps) {
  const {
    hooks: { useSession },
  } = useAuth();
  const session = useSession();
  if (session.data) {
    return null;
  }
  return children;
}
