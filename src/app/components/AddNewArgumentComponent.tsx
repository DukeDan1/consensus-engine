"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function AddNewArgumentComponent({ topicId }: { topicId: string }) {
    const [showForm, setShowForm] = useState(false);
    const [text, setText] = useState("");
    const [side, setSide] = useState<"for" | "against">("for");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const router = useRouter();

    useEffect(() => {
        if (showForm) textareaRef.current?.focus();
    }, [showForm]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const body = text.trim();
        if (!body) return;

        try {
            const res = await fetch("/api/argument", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topicId, body, side }),
            });
            if (!res.ok) throw new Error("Failed to add argument");
        } catch (err) {
            console.error("Submit argument failed", err);
        }

        setText("");
        setShowForm(false);
        router.refresh();

        // Update the page again after 15 seconds to reflect AI analysis updates
        setTimeout(() => {
            router.refresh();
        }, 15000);
    }

    return (
        <div className="mb-3">
            {!showForm ? (
                <button
                    type="button"
                    className="btn btn btn-outline-success"
                    onClick={() => setShowForm(true)}
                    aria-label="Add argument"
                >
                    <i className="fa-solid fa-plus me-1" aria-hidden></i>
                    Add argument
                </button>
            ) : (
                <div className="card mb-2">
                    <div className="card-body position-relative">
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-2"
                            onClick={() => { setShowForm(false); setText(""); }}
                            aria-label="Close add argument form"
                            title="Close"
                        >
                            <i className="fa-solid fa-xmark" aria-hidden></i>
                        </button>
                        <h6 className="card-title">Add a new argument</h6>
                        <form onSubmit={handleSubmit}>
                            <div className="mb-2">
                                <div className="form-check form-check-inline">
                                    <input className="form-check-input" type="radio" name={`side-${topicId}`} id={`side-for-${topicId}`} checked={side === "for"} onChange={() => setSide("for")} />
                                    <label className="form-check-label" htmlFor={`side-for-${topicId}`}>For</label>
                                </div>
                                <div className="form-check form-check-inline">
                                    <input className="form-check-input" type="radio" name={`side-${topicId}`} id={`side-against-${topicId}`} checked={side === "against"} onChange={() => setSide("against")} />
                                    <label className="form-check-label" htmlFor={`side-against-${topicId}`}>Against</label>
                                </div>
                            </div>
                            <div className="mb-3">
                                <label htmlFor={`argumentText-${topicId}`} className="form-label">Your Argument</label>
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
                                <button type="submit" className="btn btn-primary btn-sm">Submit Argument</button>
                                <button type="button" className="btn btn-light btn-sm" onClick={() => { setShowForm(false); setText(""); }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}