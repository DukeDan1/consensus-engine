import React from "react";
import { Button, Link, Text } from "@react-email/components";
import EmailLayout from "@/app/emails/components/EmailLayout";

type Props = {
  name: string;
  resetLink: string;
};

const textStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#334155",
  margin: "0 0 12px",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
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

export default function PasswordResetEmail({ name, resetLink }: Props) {
  return (
    <EmailLayout preview="Reset your Consensus Engine password" heading="Reset your password">
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>
        We received a request to reset your password. Use the button below to choose a new one. This link expires in 1
        hour.
      </Text>
      <Button style={buttonStyle} href={resetLink}>
        Reset password
      </Button>
      <Text style={mutedStyle}>
        If the button does not work, copy and paste this link into your browser:
      </Text>
      <Text style={mutedStyle}>
        <Link href={resetLink} style={{ color: "#2563eb" }}>
          {resetLink}
        </Link>
      </Text>
      <Text style={mutedStyle}>
        If you did not request this, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}
