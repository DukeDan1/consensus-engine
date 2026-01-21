import React from "react";
import { Button, Link, Text } from "@react-email/components";
import EmailLayout from "@/app/emails/components/EmailLayout";

type Props = {
  name: string;
  postUrl: string;
  label?: string;
};

const textStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#334155",
  margin: "0 0 12px",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#16a34a",
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

export default function PostApprovedEmail({ name, postUrl, label = "post" }: Props) {
  return (
    <EmailLayout preview="Your post is now visible" heading={`Your ${label} has been approved`}>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>Good news. Your {label} has been approved and is now visible.</Text>
      <Button style={buttonStyle} href={postUrl}>
        View your {label}
      </Button>
      <Text style={mutedStyle}>
        Or open{" "}
        <Link href={postUrl} style={{ color: "#2563eb" }}>
          {postUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}
