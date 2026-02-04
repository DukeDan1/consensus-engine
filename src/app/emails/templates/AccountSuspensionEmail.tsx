import React from "react";
import { Text } from "@react-email/components";
import EmailLayout from "@/app/emails/components/EmailLayout";

type Props = {
  name: string;
  action: "suspended" | "unsuspended";
  reason?: string;
};

const textStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#334155",
  margin: "0 0 12px",
};

const warningStyle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#dc2626",
  margin: "0 0 12px",
  fontWeight: 600,
};

const mutedStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  margin: "12px 0 0",
};

export default function AccountSuspensionEmail({ name, action, reason }: Props) {
  const isSuspended = action === "suspended";
  const heading = isSuspended ? "Your account has been suspended" : "Your account has been reinstated";
  const preview = isSuspended
    ? "Your Consensus Engine account has been suspended"
    : "Your Consensus Engine account has been reinstated";

  return (
    <EmailLayout preview={preview} heading={heading}>
      <Text style={textStyle}>Hi {name},</Text>
      {isSuspended ? (
        <>
          <Text style={warningStyle}>
            Your account on Consensus Engine has been suspended by a moderator.
          </Text>
          {reason && (
            <Text style={textStyle}>
              <strong>Reason:</strong> {reason}
            </Text>
          )}
          <Text style={textStyle}>
            While suspended, you will not be able to post new content, comment, or vote. Your existing content
            may also be hidden from other users.
          </Text>
          <Text style={mutedStyle}>
            If you believe this was a mistake, please contact our support team.
          </Text>
        </>
      ) : (
        <>
          <Text style={textStyle}>
            Good news! Your account on Consensus Engine has been reinstated.
          </Text>
          <Text style={textStyle}>
            You can now post, comment, and vote again. We appreciate your continued participation in our community.
          </Text>
        </>
      )}
    </EmailLayout>
  );
}
