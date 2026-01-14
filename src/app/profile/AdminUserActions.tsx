"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";
import ConfirmModal from "@/app/components/ui/ConfirmModal";

type Props = {
  userId: string;
  initialSuspended: boolean;
  displayName: string;
};

export default function AdminUserActions({ userId, initialSuspended, displayName }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isSuspended, setIsSuspended] = useState(initialSuspended);
  const [pending, setPending] = useState(false);
  const [showSuspend, setShowSuspend] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  if (!session?.user?.isAdmin) {
    return null;
  }

  async function handleSuspend(nextSuspended: boolean) {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: nextSuspended }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update account");
      }
      setIsSuspended(!!data?.isSuspended);
      toast.success(nextSuspended ? "Account suspended" : "Account restored");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Unable to update account");
    } finally {
      setPending(false);
      setShowSuspend(false);
    }
  }

  async function handleDelete() {
    setPending(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete user");
      }
      toast.success("User deleted");
      router.push("/topics");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Unable to delete user");
    } finally {
      setPending(false);
      setShowDelete(false);
    }
  }

  const suspendLabel = isSuspended ? "Restore account" : "Suspend account";
  const suspendMessage = isSuspended
    ? `Restore ${displayName}'s account so they can log in again?`
    : `Suspend ${displayName}'s account? They will not be able to log in.`;

  return (
    <div className="d-flex flex-wrap gap-2">
      <button
        type="button"
        className={`btn btn-sm ${isSuspended ? "btn-outline-success" : "btn-outline-warning"}`}
        onClick={() => setShowSuspend(true)}
        disabled={pending}
      >
        {suspendLabel}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => setShowDelete(true)}
        disabled={pending}
      >
        Delete user
      </button>
      <ConfirmModal
        isOpen={showSuspend}
        title={suspendLabel}
        body={<p className="mb-0">{suspendMessage}</p>}
        confirmLabel={isSuspended ? "Restore" : "Suspend"}
        confirmVariant={isSuspended ? "success" : "warning"}
        confirmIconClass={isSuspended ? "fa-solid fa-user-check" : "fa-solid fa-user-slash"}
        isBusy={pending}
        onCancel={() => setShowSuspend(false)}
        onConfirm={() => handleSuspend(!isSuspended)}
      />
      <ConfirmModal
        isOpen={showDelete}
        title="Delete user"
        body={<p className="mb-0">Delete {displayName} and remove all their content? This cannot be undone.</p>}
        confirmLabel="Delete"
        confirmVariant="danger"
        confirmIconClass="fa-solid fa-trash"
        isBusy={pending}
        onCancel={() => setShowDelete(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
