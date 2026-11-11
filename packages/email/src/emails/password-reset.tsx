import { LinkEmail, type LinkEmailProps } from "./_components/link-email.js";

export default function PasswordResetEmail(props: LinkEmailProps) {
  return <LinkEmail kind="reset" {...props} />;
}

PasswordResetEmail.PreviewProps = {
  email: "alex@example.com",
  name: "Alex",
  url: "https://raypx.local/reset?token=preview",
} satisfies LinkEmailProps;
