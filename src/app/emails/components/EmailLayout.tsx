import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Hr,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

type Props = {
  preview: string;
  heading: string;
  children: React.ReactNode;
  footerText?: string;
  appUrl?: string;
  appLabel?: string;
};

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  fontFamily: "Arial, Helvetica, sans-serif",
  margin: 0,
  padding: "24px 0",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "32px",
  margin: "0 auto",
  width: "100%",
  maxWidth: "520px",
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "22px",
  lineHeight: "1.3",
  margin: "0 0 12px",
  color: "#0f172a",
};

const footerStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#64748b",
  margin: "16px 0 0",
};

const brandStyle: React.CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#94a3b8",
  margin: "0 0 10px",
};

export default function EmailLayout({
  preview,
  heading,
  children,
  footerText,
  appUrl,
  appLabel = "Visit Consensus Engine",
}: Props) {
  const resolvedAppUrl = (appUrl || process.env.NEXTJS_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text style={brandStyle}>Consensus Engine</Text>
            <Heading style={headingStyle}>{heading}</Heading>
            <Section>{children}</Section>
            <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0" }} />
            <Text style={footerStyle}>
              {footerText || "You are receiving this email because you have an account on Consensus Engine."}
            </Text>
            {resolvedAppUrl ? (
              <Text style={footerStyle}>
                <Link href={resolvedAppUrl} style={{ color: "#2563eb" }}>
                  {appLabel}
                </Link>
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
