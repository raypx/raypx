import { auth } from "../auth";
import { AuthContext } from "../context";

export type AuthProviderProps = {
  children: React.ReactNode;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  return <AuthContext.Provider value={{ auth }}>{children}</AuthContext.Provider>;
};
