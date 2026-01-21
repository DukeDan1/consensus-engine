import React from "react";
import { Button, Link, Text } from "@react-email/components";
import EmailLayout from "@/app/emails/components/EmailLayout";

type Props = {
  name: string;
  appUrl: string;
};

const textStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#334155",
  margin: "0 0 12px",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#2563eb",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "10px 18px",
};

const mutedStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  margin: "12px 0 0",
};

export default function WelcomeEmail({ name, appUrl }: Props) {
  return (
    <EmailLayout preview="Welcome to Consensus Engine" heading={`Welcome, ${name}!`}>
      <Text style={textStyle}>
        Thanks for joining Consensus Engine. You can start exploring topics, sharing posts, and following discussions that
        matter to you.
      </Text>
      <Button style={buttonStyle} href={appUrl}>
        Go to topics
      </Button>
      <Text style={mutedStyle}>
        Or visit{" "}
        <Link href={appUrl} style={{ color: "#2563eb" }}>
          {appUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}
