"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";
import ConfirmModal from "@/app/components/ui/ConfirmModal";

type Props = {
  topicId: string;
  topicTitle?: string;
  enabled?: boolean;
};

export default function TopicAdminActions({ topicId, topicTitle, enabled = false }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  if (!session?.user?.isAdmin || !enabled) {
    return null;
  }

  async function handleDelete() {
    setPending(true);
    try {
      const res = await fetch(`/api/topics/${topicId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete topic");
      }
      toast.success("Topic deleted");
      router.push("/topics");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Unable to delete topic");
    } finally {
      setPending(false);
      setShowDelete(false);
    }
  }

  const label = topicTitle ? `"${topicTitle}"` : "this topic";

  return (
    <>
      <button
        type="button"
        className="btn btn-outline-danger btn-sm"
        onClick={() => setShowDelete(true)}
        disabled={pending}
      >
        Delete topic
      </button>
      <ConfirmModal
        isOpen={showDelete}
        title="Delete topic"
        body={<p className="mb-0">Delete {label}? This cannot be undone.</p>}
        confirmLabel="Delete"
        confirmVariant="danger"
        confirmIconClass="fa-solid fa-trash"
        isBusy={pending}
        onCancel={() => setShowDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  );
}
