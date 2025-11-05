"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function AddNewCommentComponent({ argumentId }: { argumentId: string }) {
    const [showForm, setShowForm] = useState(false);
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
        try {
            const res = await fetch("/api/comment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ argumentId, body }),
            });
            if (!res.ok) {
                throw new Error("Failed to add comment");
            }
        } catch (err) {
            // ignore network errors here; you can add toast/snackbar handling
            console.error("Submit comment failed", err);
        }

        setText("");
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
                                ></textarea>
                            </div>
                            <div className="d-flex gap-2">
                                <button type="submit" className="btn btn-primary btn-sm">Post Comment</button>
                                <button type="button" className="btn btn-light btn-sm" onClick={() => { setShowForm(false); setText(""); }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
