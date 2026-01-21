import React from "react";
import { Button, Link, Text } from "@react-email/components";
import EmailLayout from "@/app/emails/components/EmailLayout";

type Props = {
  name: string;
  action: "approve" | "remove";
  profileUrl: string;
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

export default function AvatarModerationEmail({ name, action, profileUrl }: Props) {
  const approved = action === "approve";
  const heading = approved ? "Your avatar has been approved" : "Your avatar has been removed";
  const preview = approved ? "Your avatar is now live" : "Your avatar was removed";
  const message = approved
    ? "Your avatar has been approved by a moderator and is now visible on your profile."
    : "Your avatar has been removed by a moderator. You can upload a new avatar at any time.";

  return (
    <EmailLayout preview={preview} heading={heading}>
      <Text style={textStyle}>Hi {name},</Text>
      <Text style={textStyle}>{message}</Text>
      <Button style={buttonStyle} href={profileUrl}>
        Go to your profile
      </Button>
      <Text style={mutedStyle}>
        Or open{" "}
        <Link href={profileUrl} style={{ color: "#2563eb" }}>
          {profileUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}
