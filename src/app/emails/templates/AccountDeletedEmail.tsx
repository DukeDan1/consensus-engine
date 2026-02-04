import React from "react";
import { Text } from "@react-email/components";
import EmailLayout from "@/app/emails/components/EmailLayout";

type Props = {
  name: string;
  deletedBy: "self" | "admin";
};

const textStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#334155",
  margin: "0 0 12px",
};

const mutedStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  margin: "12px 0 0",
};

export default function AccountDeletedEmail({ name, deletedBy }: Props) {
  const isSelfDeleted = deletedBy === "self";

  return (
    <EmailLayout
      preview="Your Consensus Engine account has been deleted"
      heading="Your account has been deleted"
    >
      <Text style={textStyle}>Hi {name},</Text>
      {isSelfDeleted ? (
        <>
          <Text style={textStyle}>
            As requested, your Consensus Engine account has been permanently deleted.
          </Text>
          <Text style={textStyle}>
            All your posts, comments, votes, and profile data have been removed. Topics you created have been
            deactivated.
          </Text>
          <Text style={textStyle}>
            We&apos;re sorry to see you go. If you ever want to return, you&apos;re welcome to create a new account.
          </Text>
        </>
      ) : (
        <>
          <Text style={textStyle}>
            Your Consensus Engine account has been deleted by an administrator.
          </Text>
          <Text style={textStyle}>
            All your posts, comments, votes, and profile data have been removed.
          </Text>
          <Text style={mutedStyle}>
            If you believe this was a mistake, please contact our support team.
          </Text>
        </>
      )}
    </EmailLayout>
  );
}
