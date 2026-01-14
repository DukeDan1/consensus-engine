"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

type Props = {
    topicId: string;
    onOpenChange?: (_open: boolean) => void;
};

export default function AddNewArgumentComponent({ topicId, onOpenChange }: Props) {
    const [showForm, setShowForm] = useState(false);
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [evidenceLink, setEvidenceLink] = useState("");
    const [evidence, setEvidence] = useState<Array<{ url: string; kind: "link" | "file"; fileName?: string; contentType?: string; label?: string }>>([]);
    const router = useRouter();

    useEffect(() => {
        if (showForm) textareaRef.current?.focus();
    }, [showForm]);

    function toggleForm(next: boolean) {
        setShowForm(next);
        if (!next) setText("");
        onOpenChange?.(next);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const body = text.trim();
        if (!body) return;

        setSubmitting(true);
        try {
            const res = await fetch("/api/argument", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topicId, body, evidence }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const reason = data?.reason || data?.error || "Failed to add argument";
                if (res.status === 403) {
                    toast.error(`Blocked: ${reason}`);
                } else {
                    toast.error(reason);
                }
                return;
            }

            const status = data?.visibility?.status;
            const reason = data?.visibility?.reason || data?.reason;
            if (status === "hidden" || status === "needs_review") {
                toast.info(reason ? `Submitted for review: ${reason}` : "Submitted for review. It may be hidden until cleared.", { autoClose: 15000 });
            } else if (status === "visible") {
                toast.success("Posted successfully");
            }
        } catch (err) {
            console.error("Submit argument failed", err);
            toast.error("Unable to post right now. Please try again.");
            return;
        } finally {
            setSubmitting(false);
        }

        setText("");
        setEvidence([]);
        toggleForm(false);
        router.replace(`/topics/${topicId}?ordering=newest`);
        router.refresh();
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }

        setTimeout(() => {
            router.refresh();
        }, 10000);
    }

    async function handleAddLink() {
        const link = evidenceLink.trim();
        if (!link) return;
        try {
            const url = new URL(link).toString();
            setEvidence((prev) => [...prev, { url, kind: "link" as const }].slice(0, 6));
            setEvidenceLink("");
        } catch {
            toast.error("Please enter a valid URL");
        }
    }

    async function handleFileUpload(file: File) {
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
                { url: storedUrl as string, kind: "file" as const, fileName: (data.fileName || file.name) as string, contentType: (data.contentType || file.type) as string },
            ].slice(0, 6));
            toast.success("File attached");
        } catch (err: any) {
            console.error("File upload failed", err);
            toast.error(err?.message || "Failed to upload file");
        }
    }

    function removeEvidenceAt(index: number) {
        setEvidence((prev) => prev.filter((_, i) => i !== index));
    }

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        for (const file of files) {
            await handleFileUpload(file);
        }
        e.target.value = "";
    }

    async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
        const files = Array.from(e.clipboardData?.files ?? []);
        if (!files.length) return;
        e.preventDefault();
        for (const file of files) {
            await handleFileUpload(file);
        }
    }

    return (
        <div className="mb-3 w-100">
            {!showForm ? (
                <button
                    type="button"
                    className="btn btn-outline-success"
                    onClick={() => toggleForm(true)}
                    aria-label="Start a new discussion point"
                >
                    <i className="fa-solid fa-plus me-1" aria-hidden></i>
                    Start discussion
                </button>
            ) : (
                <div className="card mb-2">
                    <div className="card-body position-relative">
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-2"
                            onClick={() => toggleForm(false)}
                            aria-label="Close add discussion form"
                            title="Close"
                        >
                            <i className="fa-solid fa-xmark" aria-hidden></i>
                        </button>
                        <h6 className="card-title">Share something with the discussion</h6>
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label htmlFor={`argumentText-${topicId}`} className="form-label">
                                    Your message
                                </label>
                                <textarea
                                    ref={textareaRef}
                                    className="form-control"
                                    id={`argumentText-${topicId}`}
                                    rows={4}
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    onPaste={handlePaste}
                                ></textarea>
                            </div>
                            <div className="mb-3">
                                <label className="form-label">Evidence</label>
                                <div className="d-flex gap-2 mb-2">
                                    <input
                                        className="form-control"
                                        placeholder="Add a link to evidence"
                                        value={evidenceLink}
                                        onChange={(e) => setEvidenceLink(e.target.value)}
                                    />
                                    <button type="button" className="btn btn-outline-secondary" onClick={handleAddLink} disabled={!evidenceLink.trim()}>
                                        Add link
                                    </button>
                                </div>
                                <div className="mb-2">
                                    <label className="form-label small">Upload a file</label>
                                    <input type="file" className="form-control" onChange={handleFileChange} multiple />
                                </div>
                                {evidence.length > 0 && (
                                    <div className="small text-muted">
                                        Attached:
                                        <ul className="list-unstyled mb-0 mt-1">
                                            {evidence.map((ev, idx) => (
                                                <li key={`${ev.url}-${idx}`} className="d-flex align-items-center gap-2">
                                                    <span className="text-truncate" style={{ maxWidth: "320px" }}>
                                                        {ev.fileName || ev.url}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-link btn-sm text-danger p-0"
                                                        onClick={() => removeEvidenceAt(idx)}
                                                        aria-label="Remove attachment"
                                                    >
                                                        Remove
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                            <div className="d-flex gap-2">
                                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                                    {submitting ? "Posting..." : "Post"}
                                </button>
                                <button type="button" className="btn btn-light btn-sm" onClick={() => toggleForm(false)} disabled={submitting}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}