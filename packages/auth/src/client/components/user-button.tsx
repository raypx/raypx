import { Button } from "@raypx/ui/components/button";
import { useAuth } from "../hooks";

export const UserButton = () => {
  const { auth } = useAuth();
  const session = auth.useSession();

  return (
    <Button onClick={() => auth.signOut()}>
      {session.data?.user?.name || session.data?.user?.email || "User"}
    </Button>
  );
};
