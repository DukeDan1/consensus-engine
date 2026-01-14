import { useState, type ChangeEvent, type ClipboardEvent } from "react";
import { toast } from "react-toastify";
import type { EvidenceItem } from "@/app/lib/evidence";

type Options = {
  maxItems?: number;
};

export function useEvidenceAttachments(options: Options = {}) {
  const maxItems = options.maxItems ?? 10;
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [evidenceLink, setEvidenceLink] = useState("");
  const canAddMore = evidence.length < maxItems;

  function clearEvidence() {
    setEvidence([]);
    setEvidenceLink("");
  }

  async function handleAddLink() {
    if (!canAddMore) {
      toast.info(`Limit reached: up to ${maxItems} items.`);
      return;
    }
    const link = evidenceLink.trim();
    if (!link) return;
    try {
      const url = new URL(link).toString();
      setEvidence((prev) => [...prev, { url, kind: "link" as const }].slice(0, maxItems));
      setEvidenceLink("");
    } catch {
      toast.error("Please enter a valid URL");
    }
  }

  async function handleFileUpload(file: File) {
    if (!canAddMore) {
      toast.info(`Limit reached: up to ${maxItems} items.`);
      return;
    }
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/uploads", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Upload failed");
      }

      const storedUrl = data.storageUrl || data.url;
      setEvidence((prev) => [
        ...prev,
        {
          url: storedUrl as string,
          kind: "file" as const,
          fileName: (data.fileName || file.name) as string,
          contentType: (data.contentType || file.type) as string,
        },
      ].slice(0, maxItems));
      toast.success("File attached");
    } catch (err: any) {
      console.error("File upload failed", err);
      toast.error(err?.message || "Failed to upload file");
    }
  }

  async function removeEvidenceAt(index: number) {
    const item = evidence[index];
    setEvidence((prev) => prev.filter((_, i) => i !== index));
    if (item?.kind !== "file") return;
    try {
      const res = await fetch("/api/uploads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Delete failed");
      }
    } catch (err: any) {
      console.error("File delete failed", err);
      toast.error(err?.message || "Failed to delete file");
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const remaining = maxItems - evidence.length;
    if (remaining <= 0) {
      toast.info(`Limit reached: up to ${maxItems} items.`);
      e.target.value = "";
      return;
    }
    if (files.length) {
      await Promise.all(files.slice(0, remaining).map((file) => handleFileUpload(file)));
    }
    e.target.value = "";
  }

  async function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    const remaining = maxItems - evidence.length;
    if (remaining <= 0) {
      toast.info(`Limit reached: up to ${maxItems} items.`);
      return;
    }
    await Promise.all(files.slice(0, remaining).map((file) => handleFileUpload(file)));
  }

  return {
    maxItems,
    canAddMore,
    evidence,
    evidenceLink,
    setEvidenceLink,
    handleAddLink,
    handleFileChange,
    handlePaste,
    removeEvidenceAt,
    clearEvidence,
  };
}
