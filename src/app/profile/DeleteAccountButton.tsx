"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { toast } from "react-toastify";
import ConfirmModal from "@/app/components/ui/ConfirmModal";

type Props = {
  userId: string;
};

export default function DeleteAccountButton({ userId }: Props) {
  const { data: session } = useSession();
  const [showModal, setShowModal] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const isOwner = !!session?.user?.id && session.user.id === userId;

  if (!isOwner) {
    return null;
  }

  const handleDelete = async () => {
    setIsBusy(true);
    try {
      const response = await fetch("/api/user/delete", {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete account");
      }

      toast.success("Your account has been deleted.");
      setShowModal(false);
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete account");
      setIsBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-outline-danger btn-sm"
        onClick={() => setShowModal(true)}
      >
        <i className="fa-solid fa-trash me-1" aria-hidden="true"></i>
        Delete account
      </button>

      <ConfirmModal
        isOpen={showModal}
        title="Delete your account?"
        body={
          <div>
            <p className="mb-2">
              This action is <strong>permanent</strong> and cannot be undone.
            </p>
            <p className="mb-2">Deleting your account will:</p>
            <ul className="mb-0">
              <li>Remove all your posts and comments</li>
              <li>Remove all your votes</li>
              <li>Deactivate any topics you created</li>
              <li>Delete any facts derived from your posts</li>
              <li>Remove your profile and all associated data</li>
            </ul>
          </div>
        }
        confirmLabel="Delete my account"
        cancelLabel="Cancel"
        confirmVariant="danger"
        confirmIconClass="fa-solid fa-trash"
        isBusy={isBusy}
        onConfirm={handleDelete}
        onCancel={() => setShowModal(false)}
      />
    </>
  );
}
