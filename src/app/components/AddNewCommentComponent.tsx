"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import EvidencePicker from "@/app/components/EvidencePicker";
import { useEvidenceAttachments } from "@/app/lib/useEvidenceAttachments";
import { TopicApiResponse } from "@/app/types/topicApiResponse";

export default function AddNewCommentComponent({
    argumentId,
    onOptimisticAdd,
    onOptimisticResolve,
    onOptimisticReject,
}: {
    argumentId: string;
    onOptimisticAdd?: (_comment: TopicApiResponse["arguments"][number]["comments"][number]) => void;
    onOptimisticResolve?: (_tempId: string, _comment: TopicApiResponse["arguments"][number]["comments"][number]) => void;
    onOptimisticReject?: (_tempId: string) => void;
}) {
    const [showForm, setShowForm] = useState(false);
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const { data: session } = useSession();
    const sessionUser = session?.user as any;
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

        const tempId = `temp-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimisticComment: TopicApiResponse["arguments"][number]["comments"][number] = {
            id: tempId,
            body,
            createdBy: {
                _id: sessionUser?.id,
                name: sessionUser?.name || sessionUser?.email || "You",
                nickname: sessionUser?.nickname,
                avatarUrl: sessionUser?.avatarUrl,
                avatarThumbUrl: sessionUser?.avatarThumbUrl,
            },
            createdAt: new Date().toISOString(),
            upvoteCount: 0,
            downvoteCount: 0,
            score: 0,
            ontologyCategories: [],
            evidence: preparedEvidence.evidence,
            visibility: { status: "visible" },
        };

        onOptimisticAdd?.(optimisticComment);

        setSubmitting(true);
        try {
            const res = await fetch("/api/comment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ argumentId, body, evidence: preparedEvidence.evidence }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const reason = data?.reason || data?.error || "Failed to add comment";
                if (res.status === 403) {
                    toast.error(`Blocked: ${reason}`);
                } else {
                    toast.error(reason);
                }
                onOptimisticReject?.(tempId);
                return;
            }

            const status = data?.visibility?.status;
            const reason = data?.visibility?.reason || data?.reason;
            if (status === "blocked") {
                onOptimisticReject?.(tempId);
            } else if (data?.id) {
                onOptimisticResolve?.(tempId, data);
            }
            if (status === "blocked" || status === "needs_review" || status === "hidden") {
                toast.info(
                    reason ? `Submitted for review: ${reason}` : "Submitted for review. It may be hidden until cleared.",
                    { autoClose: 15000 }
                );
            } else {
                toast.success("Comment posted");
            }
            if (data?.moderatorPromotion?.promoted) {
                toast.success("You're now a moderator for this topic.");
            }
        } catch (err) {
            // ignore network errors here; you can add toast/snackbar handling
            console.error("Submit comment failed", err);
            toast.error("Unable to post right now. Please try again.");
            onOptimisticReject?.(tempId);
            return;
        } finally {
            setSubmitting(false);
        }

        setText("");
        clearEvidence();
        setShowForm(false);
        // Refresh the current route so comments re-fetch and include the new one
        router.refresh();
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
                            <EvidencePicker
                                evidence={evidence}
                                evidenceLink={evidenceLink}
                                onEvidenceLinkChange={setEvidenceLink}
                                onAddLink={handleAddLink}
                                onFileChange={handleFileChange}
                                onRemove={removeEvidenceAt}
                                maxItems={maxItems}
                                canAddMore={canAddMore}
                                maxLabelWidth={280}
                            />
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
