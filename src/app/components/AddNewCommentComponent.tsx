"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

export default function AddNewCommentComponent({ argumentId }: { argumentId: string }) {
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

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const body = text.trim();
        if (!body) return;

        // Placeholder: attempt to POST to a comments API if available. If you have an endpoint,
        // update the URL below. For now we'll optimistically clear and hide the form.
        setSubmitting(true);
        try {
            const res = await fetch("/api/comment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ argumentId, body, evidence }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const reason = data?.reason || data?.error || "Failed to add comment";
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
                toast.success("Comment posted");
            }
        } catch (err) {
            // ignore network errors here; you can add toast/snackbar handling
            console.error("Submit comment failed", err);
            toast.error("Unable to post right now. Please try again.");
            return;
        } finally {
            setSubmitting(false);
        }

        setText("");
        setEvidence([]);
        setShowForm(false);
        // Refresh the current route so comments re-fetch and include the new one
        router.refresh();
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
        <div className="mb-3">
            {!showForm ? (
                <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => setShowForm(true)}
                    aria-label="Reply"
                >
                    <i className="fa-solid fa-reply me-1" aria-hidden></i>
                    Reply
                </button>
            ) : (
                <div className="card mb-2">
                    <div className="card-body position-relative">
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-2"
                            onClick={() => { setShowForm(false); setText(""); }}
                            aria-label="Close reply form"
                            title="Close"
                        >
                            <i className="fa-solid fa-xmark" aria-hidden></i>
                        </button>
                        <form onSubmit={handleSubmit}>
                            <div className="mb-3">
                                <label htmlFor={`commentText-${argumentId}`} className="form-label fw-bold h6 card-title">Your Comment</label>
                                <textarea
                                    ref={textareaRef}
                                    className="form-control"
                                    id={`commentText-${argumentId}`}
                                    rows={3}
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
                                                    <span className="text-truncate" style={{ maxWidth: "280px" }}>
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
                                    {submitting ? "Posting..." : "Post Comment"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-light btn-sm"
                                    onClick={() => { setShowForm(false); setText(""); }}
                                    disabled={submitting}
                                >
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
