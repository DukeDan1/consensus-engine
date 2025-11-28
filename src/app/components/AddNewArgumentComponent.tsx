"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
    topicId: string;
    onOpenChange?: (_open: boolean) => void;
};

export default function AddNewArgumentComponent({ topicId, onOpenChange }: Props) {
    const [showForm, setShowForm] = useState(false);
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [submitting, setSubmitting] = useState(false);
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
                body: JSON.stringify({ topicId, body }),
            });
            if (!res.ok) throw new Error("Failed to add argument");
        } catch (err) {
            console.error("Submit argument failed", err);
        } finally {
            setSubmitting(false);
        }

        setText("");
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
                                ></textarea>
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