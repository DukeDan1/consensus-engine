"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopicApiResponse } from "@/app/types/topicApiResponse";
import AddNewCommentComponent from "@/app/components/AddNewCommentComponent";
import { timeAgo } from "@/app/lib/commonFunctions";

function normaliseId(value: unknown): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if (typeof value === "object" && value !== null) {
        const maybeToString = (value as { toString?: () => string }).toString;
        if (typeof maybeToString === "function") {
            return maybeToString.call(value);
        }
    }
    return undefined;
}

function applyHighlight(element: HTMLElement) {
    const prevTransition = element.style.transition;
    const prevBg = element.style.backgroundColor;
    element.style.transition = prevTransition && prevTransition.length > 0
        ? `${prevTransition}, background-color 0.6s ease`
        : "background-color 0.6s ease";
    element.style.backgroundColor = "#fff3cd";
    window.setTimeout(() => {
        element.style.backgroundColor = prevBg || "";
        element.style.transition = prevTransition;
    }, 1200);
}


export default function ArgumentCard({ argument }: { argument: TopicApiResponse["arguments"][number] }) {
    const [upvotes, setUpvotes] = useState<number>((argument as any).upvoteCount ?? 0);
    const [downvotes, setDownvotes] = useState<number>((argument as any).downvoteCount ?? 0);
    const [voting, setVoting] = useState<boolean>(false);
    const [commentStates, setCommentStates] = useState(() => argument.comments?.map((c) => ({ ...c })) ?? []);

    useEffect(() => {
        setCommentStates(argument.comments?.map((c) => ({ ...c })) ?? []);
    }, [argument.comments]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const highlightFromHash = () => {
            const hash = window.location.hash?.replace("#", "");
            if (!hash) return;

            if (hash === `argument-${argument.id}`) {
                const argumentElement = document.getElementById(hash);
                if (!argumentElement) return;
                argumentElement.scrollIntoView({ behavior: "smooth", block: "start" });
                const cardElement = (argumentElement.querySelector(".card") as HTMLElement) || argumentElement;
                applyHighlight(cardElement);
                return;
            }

            if (hash.startsWith("comment-")) {
                const commentElement = document.getElementById(hash);
                if (commentElement && commentElement.closest(`#argument-${argument.id}`)) {
                    commentElement.scrollIntoView({ behavior: "smooth", block: "center" });
                    applyHighlight(commentElement as HTMLElement);
                }
            }
        };

        highlightFromHash();
        window.addEventListener("hashchange", highlightFromHash);
        return () => window.removeEventListener("hashchange", highlightFromHash);
    }, [argument.id, commentStates]);

    async function sendVote(value: 1 | -1) {
        if (voting) return;
        setVoting(true);
        try {
            const res = await fetch("/api/vote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetType: "Argument", targetId: argument.id, value }),
            });
            if (!res.ok) throw new Error("Vote failed");
            const json = await res.json();
            setUpvotes(json.upvoteCount ?? upvotes);
            setDownvotes(json.downvoteCount ?? downvotes);
        } catch (e) {
            // Could show a toast/snackbar here; keep it silent for now
            console.error("Vote error", e);
        } finally {
            setVoting(false);
        }
    }

    async function sendCommentVote(commentId: string, value: 1 | -1) {
        setCommentStates((prev) => prev.map((comment) => {
            if (comment.id !== commentId) return comment;
            return { ...comment, pending: true } as any;
        }));

        try {
            const res = await fetch("/api/vote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetType: "Comment", targetId: commentId, value }),
            });
            if (!res.ok) throw new Error("Vote failed");
            const json = await res.json();
            setCommentStates((prev) => prev.map((comment) => {
                if (comment.id !== commentId) return { ...comment, pending: false } as any;
                return {
                    ...comment,
                    pending: false,
                    upvoteCount: json.upvoteCount ?? comment.upvoteCount ?? 0,
                    downvoteCount: json.downvoteCount ?? comment.downvoteCount ?? 0,
                };
            }));
        } catch (err) {
            console.error("Comment vote error", err);
            setCommentStates((prev) => prev.map((comment) => (
                comment.id === commentId ? { ...comment, pending: false } as any : comment
            )));
        }
    }

    const createdLabel = useMemo(() => {
        if (!argument?.createdAt) return "";
        return timeAgo(argument.createdAt);
    }, [argument.createdAt]);

    const authorId = normaliseId(typeof argument.createdBy === "string" ? argument.createdBy : argument.createdBy?._id);
    const authorName = argument.createdBy?.name ?? "Anonymous";

    return (
        <>
            <div id={`argument-${argument.id}`} className="col-12" key={argument.id}>
                <div className="card h-100 shadow-sm">
                    <div className="card-body">
                        <div className="d-flex align-items-start justify-content-between mb-3">
                            <div>
                                <div className="fw-semibold">
                                    {authorId ? (
                                        <Link href={`/profile/${authorId}`} className="author-link">
                                            {authorName}
                                        </Link>
                                    ) : (
                                        authorName
                                    )}
                                </div>
                                <small className="text-muted">{createdLabel}</small>
                            </div>

                            <div className="d-flex align-items-center gap-2 align-self-end">
                                <button
                                    className="badge bg-success-subtle text-success"
                                    onClick={() => sendVote(1)}
                                    disabled={voting}
                                    aria-label="Upvote"
                                >
                                    <i className="fa-solid fa-thumbs-up me-1" aria-hidden="true"></i>
                                    {upvotes}
                                </button>
                                <button
                                    className="badge bg-danger-subtle text-danger"
                                    onClick={() => sendVote(-1)}
                                    disabled={voting}
                                    aria-label="Downvote"
                                >
                                    <i className="fa-solid fa-thumbs-down me-1" aria-hidden="true"></i>
                                    {downvotes}
                                </button>
                                <span className="badge text-bg-light">
                                    <i className="fa-regular fa-comments me-1" aria-hidden="true"></i>
                                    {argument.commentCount ?? commentStates.length} replies
                                </span>
                            </div>

                        </div>
                        <p className="mb-3">{argument.body}</p>

                        {/* Comments */}
                        {commentStates.length > 0 && (
                            <div className="mt-3">
                                <h6 className="mb-2">Comments</h6>
                                <ul className="list-unstyled mb-0">
                                    {commentStates.map((c) => {
                                        const commenterId = normaliseId(typeof c.createdBy === "string" ? c.createdBy : c.createdBy?._id);
                                        const commenterName = c.createdBy?.name ?? "Anonymous";
                                        const pending = (c as any).pending;
                                        return (
                                            <li
                                                id={`comment-${c.id}`}
                                                key={c.id}
                                                className="mb-2 p-2 rounded bg-light border"
                                                style={{ borderLeft: "4px solid #6c757d" }}
                                            >
                                                <div className="d-flex justify-content-between align-items-start mb-2">
                                                    <div className="small text-muted fw-semibold">
                                                        <i className="fa-regular fa-user me-1"></i>
                                                        {commenterId ? (
                                                            <Link href={`/profile/${commenterId}`} className="author-link">
                                                                {commenterName}
                                                            </Link>
                                                        ) : (
                                                            commenterName
                                                        )}
                                                        <span className="ms-2 fw-light small">{c.createdAt ? timeAgo(c.createdAt) : ""}</span>
                                                    </div>
                                                    <div className="d-flex align-items-center gap-1">
                                                        <button
                                                            className="btn btn-link btn-sm text-success p-0"
                                                            onClick={() => sendCommentVote(c.id, 1)}
                                                            disabled={pending}
                                                            aria-label="Upvote comment"
                                                        >
                                                            <i className="fa-solid fa-thumbs-up me-1" aria-hidden="true"></i>
                                                            {c.upvoteCount ?? 0}
                                                        </button>
                                                        <button
                                                            className="btn btn-link btn-sm text-danger p-0"
                                                            onClick={() => sendCommentVote(c.id, -1)}
                                                            disabled={pending}
                                                            aria-label="Downvote comment"
                                                        >
                                                            <i className="fa-solid fa-thumbs-down me-1" aria-hidden="true"></i>
                                                            {c.downvoteCount ?? 0}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="ps-2">{c.body}</div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                        <div className="mt-3">
                            <AddNewCommentComponent argumentId={argument.id} />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
