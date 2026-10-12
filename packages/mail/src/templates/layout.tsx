import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";
import type { ReactNode } from "react";
import type { Locale } from "@voidmix/i18n/types";

export interface MailLayoutProps {
  children: ReactNode;
  preview: string;
  title: string;
  action?: { label: string; url: string };
  baseUrl?: string;
  locale?: Locale;
  footer?: string;
}

export function MailLayout({
  children,
  preview,
  title,
  action,
  baseUrl,
  locale = "en",
  footer = "This message was sent by Voidmix. If you did not request it, you can safely ignore it.",
}: MailLayoutProps) {
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.wordmark}>VOIDMIX</Text>
          <Heading as="h1" style={styles.heading}>
            {title}
          </Heading>
          <Section style={styles.content}>{children}</Section>
          {action ? (
            <Section style={styles.action}>
              <Button href={action.url} style={styles.button}>
                {action.label}
              </Button>
            </Section>
          ) : null}
          <Hr style={styles.rule} />
          <Text style={styles.footer}>{footer}</Text>
          {baseUrl ? <Text style={styles.footer}>{baseUrl}</Text> : null}
        </Container>
      </Body>
    </Html>
  );
}

export const EmailLayout = MailLayout;

const styles = {
  action: { margin: "28px 0" },
  body: {
    backgroundColor: "#f5f5f5",
    color: "#171717",
    fontFamily: "Arial, Helvetica, sans-serif",
    margin: 0,
    padding: "32px 12px",
  },
  button: {
    backgroundColor: "#171717",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "600",
    padding: "12px 18px",
    textDecoration: "none",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e5e5",
    borderRadius: "10px",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "36px",
  },
  content: { fontSize: "15px", lineHeight: "24px" },
  footer: { color: "#737373", fontSize: "12px", lineHeight: "18px", margin: 0 },
  heading: { fontSize: "26px", lineHeight: "32px", margin: "20px 0" },
  rule: { borderColor: "#e5e5e5", margin: "32px 0 20px" },
  wordmark: { fontSize: "12px", fontWeight: "700", letterSpacing: "0.18em", margin: 0 },
} as const;
