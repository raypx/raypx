import { Link } from "@tanstack/react-router";

export function SignInFooter() {
  return (
    <>
      Don't have an account?{" "}
      <Link className="font-medium underline underline-offset-4 hover:text-primary" to="/sign-up">
        Sign Up
      </Link>
    </>
  );
}

export function SignUpFooter() {
  return (
    <>
      Already have an account?{" "}
      <Link className="font-medium underline underline-offset-4 hover:text-primary" to="/sign-in">
        Sign In
      </Link>
    </>
  );
}

export function ForgotPasswordFooter() {
  return (
    <>
      Remember your password?{" "}
      <Link className="font-medium underline underline-offset-4 hover:text-primary" to="/sign-in">
        Sign in
      </Link>
    </>
  );
}
