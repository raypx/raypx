import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import { type LinkEmailKind, linkEmailContent } from "../../copy.js";
import type { MailLocale, SendLinkEmailInput } from "../../types.js";

export interface LinkEmailProps extends SendLinkEmailInput {
  defaultLocale?: MailLocale;
}

const text = { color: "#3f3f46", fontSize: "16px", lineHeight: "26px" };

export function LinkEmail({
  kind,
  defaultLocale,
  ...input
}: LinkEmailProps & { kind: LinkEmailKind }) {
  const content = linkEmailContent(kind, input, defaultLocale);
  return (
    <Html lang={content.locale}>
      <Head />
      <Preview>{content.body}</Preview>
      <Body
        style={{
          backgroundColor: "#f4f4f5",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          padding: "32px 16px",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            maxWidth: "520px",
            padding: "32px",
          }}
        >
          <Heading style={{ color: "#18181b", fontSize: "22px", margin: "0 0 24px" }}>
            {content.site}
          </Heading>
          <Text style={text}>{content.greeting}</Text>
          <Text style={text}>{content.body}</Text>
          <Button
            href={content.url}
            style={{
              backgroundColor: "#18181b",
              borderRadius: "8px",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: 600,
              margin: "8px 0 16px",
              padding: "12px 20px",
            }}
          >
            {content.action}
          </Button>
          <Text style={{ ...text, color: "#71717a", fontSize: "13px", wordBreak: "break-all" }}>
            <Link href={content.url} style={{ color: "#71717a" }}>
              {content.url}
            </Link>
          </Text>
          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
          <Text style={{ ...text, color: "#71717a", fontSize: "13px" }}>{content.ignore}</Text>
        </Container>
      </Body>
    </Html>
  );
}
