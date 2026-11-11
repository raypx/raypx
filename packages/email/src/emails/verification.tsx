import { LinkEmail, type LinkEmailProps } from "./_components/link-email.js";

export default function VerificationEmail(props: LinkEmailProps) {
  return <LinkEmail kind="verification" {...props} />;
}

VerificationEmail.PreviewProps = {
  email: "alex@example.com",
  name: "Alex",
  url: "https://raypx.local/verify?token=preview",
} satisfies LinkEmailProps;
