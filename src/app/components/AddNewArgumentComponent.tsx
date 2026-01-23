"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import EvidencePicker from "@/app/components/EvidencePicker";
import { useEvidenceAttachments } from "@/app/lib/useEvidenceAttachments";

type Props = {
    topicId: string;
    onOpenChange?: (_open: boolean) => void;
};

export default function AddNewArgumentComponent({ topicId, onOpenChange }: Props) {
    const [showForm, setShowForm] = useState(false);
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const {
        evidence,
        evidenceLink,
        setEvidenceLink,
        handleAddLink,
        handleFileChange,
        handlePaste,
        removeEvidenceAt,
        clearEvidence,
        prepareEvidenceForSubmit,
        maxItems,
        canAddMore,
    } = useEvidenceAttachments();
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

        const preparedEvidence = prepareEvidenceForSubmit();
        if (preparedEvidence.error) {
            toast.error(preparedEvidence.error);
            return;
        }
        if (preparedEvidence.linkSkipped) {
            toast.info(`Limit reached: up to ${maxItems} items.`);
        }

        setSubmitting(true);
        try {
            const res = await fetch("/api/argument", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topicId, body, evidence: preparedEvidence.evidence }),
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
            if (data?.moderatorPromotion?.promoted) {
                const topicTitle = data?.moderatorPromotion?.topicTitle;
                toast.success(topicTitle ? `You're now a moderator for "${topicTitle}".` : "You're now a moderator for this topic.");
            }
        } catch (err) {
            console.error("Submit argument failed", err);
            toast.error("Unable to post right now. Please try again.");
            return;
        } finally {
            setSubmitting(false);
        }

        setText("");
        clearEvidence();
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
                            <EvidencePicker
                                evidence={evidence}
                                evidenceLink={evidenceLink}
                                onEvidenceLinkChange={setEvidenceLink}
                                onAddLink={handleAddLink}
                                onFileChange={handleFileChange}
                                onRemove={removeEvidenceAt}
                                maxItems={maxItems}
                                canAddMore={canAddMore}
                                maxLabelWidth={320}
                            />
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
