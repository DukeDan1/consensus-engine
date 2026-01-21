import React from "react";
import { Button, Link, Text } from "@react-email/components";
import EmailLayout from "@/app/emails/components/EmailLayout";

type Props = {
  name: string;
  message: string;
  actionUrl: string;
  actionLabel?: string;
  preview?: string;
  appUrl?: string;
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

const unsubscribeStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#94a3b8",
  margin: "16px 0 0",
};

export default function ActivityNotificationEmail({
  name,
  message,
  actionUrl,
  actionLabel = "View activity",
  preview,
  appUrl,
}: Props) {
  const previewText = preview || message;
  const baseUrl = appUrl?.replace(/\/$/, "");
  const profileUrl = baseUrl ? `${baseUrl}/profile` : "/profile";
  return (
    <EmailLayout preview={previewText} heading="New activity">
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>{message}</Text>
      <Button style={buttonStyle} href={actionUrl}>
        {actionLabel}
      </Button>
      <Text style={mutedStyle}>
        Or open{" "}
        <Link href={actionUrl} style={{ color: "#2563eb" }}>
          {actionUrl}
        </Link>
      </Text>
      <Text style={unsubscribeStyle}>
        You can unsubscribe from these activity notification emails by visiting your profile and unsubscribing:{" "}
        <Link href={profileUrl} style={{ color: "#2563eb" }}>
          {profileUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}
