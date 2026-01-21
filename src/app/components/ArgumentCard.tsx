"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import { TopicApiResponse } from "@/app/types/topicApiResponse";
import AddNewCommentComponent from "@/app/components/AddNewCommentComponent";
import { timeAgo } from "@/app/lib/commonFunctions";
import ConfirmModal from "@/app/components/ui/ConfirmModal";
import UserIdentity from "@/app/components/users/UserIdentity";
import NotificationSubscribeButton from "@/app/components/notifications/NotificationSubscribeButton";

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

type UserSummary = {
    id?: string;
    name?: string;
    nickname?: string;
    avatarUrl?: string | null;
    avatarThumbUrl?: string | null;
    createdAt?: string | Date | null;
    stats?: {
        posts: number;
        comments: number;
        upvotes: number;
        followers: number;
    };
};

function resolveUserSummary(value: any): UserSummary {
    if (!value) return {};
    if (typeof value === "string") {
        return { id: value };
    }
    if (typeof value === "object") {
        return {
            id: normaliseId(value._id),
            name: value.name ?? undefined,
            nickname: value.nickname ?? undefined,
            avatarUrl: value.avatarUrl ?? null,
            avatarThumbUrl: value.avatarThumbUrl ?? null,
            createdAt: value.createdAt ?? null,
            stats: value.stats ?? undefined,
        };
    }
    return {};
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

function getVisibilityLabel(status?: string) {
    if (!status || status === "visible") return null;
    if (status === "needs_review") return "Needs review";
    if (status === "blocked") return "Blocked";
    return "Hidden";
}

function EvidenceImageItem({ item, label }: { item: any; label: string }) {
    const [showDetails, setShowDetails] = useState(false);
    const url = item?.url;
    const previewUrl = item?.previewUrl || url;
    const originalUrl = item?.originalUrl || url;
    const reasons = Array.isArray(item?.blurReasons) ? item.blurReasons.filter(Boolean) : [];
    const isBlurred = !!item?.blurred;

    if (!url) return null;

    return (
        <div className="border rounded p-1 bg-light-subtle">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={previewUrl}
                alt={label}
                style={{ width: 128, height: 128, objectFit: "cover" }}
                onError={(event) => {
                    if (previewUrl !== url) {
                        event.currentTarget.src = url;
                    }
                }}
            />
            {isBlurred ? (
                <div className="mt-2 small">
                    <div className="text-danger mb-2">Our automated systems have detected harmful content in this image.</div>
                    {!showDetails ? (
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => setShowDetails(true)}
                        >
                            View
                        </button>
                    ) : (
                        <div>
                            <div className="small text-muted">Flag reasons:</div>
                            <div className="d-flex flex-wrap gap-1 mt-1">
                                {reasons.length ? reasons.map((reason: string) => (
                                    <span key={reason} className="badge text-bg-warning">
                                        {reason}
                                    </span>
                                )) : (
                                    <span className="badge text-bg-warning">Flagged by automated safety system</span>
                                )}
                            </div>
                            <div className="d-flex flex-wrap gap-2 mt-2">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => {
                                        if (originalUrl) {
                                            window.open(originalUrl, "_blank", "noopener,noreferrer");
                                        }
                                        setShowDetails(false);
                                    }}
                                >
                                    View image
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => setShowDetails(false)}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="small text-muted mt-1">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-decoration-none">
                        Open in new tab
                    </a>
                </div>
            )}
        </div>
    );
}

function EvidenceList({ evidence }: { evidence?: any[] }) {
    if (!evidence || !evidence.length) return null;
    return (
        <div className="mt-2">
            <div className="fw-semibold small mb-1">Evidence</div>
            <div className="d-flex flex-wrap gap-2">
                {evidence.map((item, idx) => {
                    const url = item?.url;
                    if (!url) return null;
                    const isImage = (item?.contentType || "").startsWith("image/");
                    const label = item?.label || item?.fileName || url;
                    if (isImage) {
                        return <EvidenceImageItem key={`${url}-${idx}`} item={item} label={label} />;
                    }
                    return (
                        <a
                            key={`${url}-${idx}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="badge text-bg-secondary text-decoration-none"
                            title={label}
                        >
                            <i className="fa-solid fa-paperclip me-1" aria-hidden="true"></i>
                            {label?.slice(0, 40)}
                        </a>
                    );
                })}
            </div>
        </div>
    );
}


export default function ArgumentCard({
    argument,
    moderatorMode = false,
}: {
    argument: TopicApiResponse["arguments"][number];
    moderatorMode?: boolean;
}) {
    const { data: session } = useSession();
    const router = useRouter();
    const [upvotes, setUpvotes] = useState<number>((argument as any).upvoteCount ?? 0);
    const [downvotes, setDownvotes] = useState<number>((argument as any).downvoteCount ?? 0);
    const [voting, setVoting] = useState<boolean>(false);
    const [commentStates, setCommentStates] = useState(argument.comments?.map((c) => ({ ...c })) ?? []);
    const [deletingArgument, setDeletingArgument] = useState(false);
    const [argumentDeleted, setArgumentDeleted] = useState(false);
    const [showArgumentDelete, setShowArgumentDelete] = useState(false);
    const [commentDeleteId, setCommentDeleteId] = useState<string | null>(null);
    const [restoringArgument, setRestoringArgument] = useState(false);
    const [restoringCommentId, setRestoringCommentId] = useState<string | null>(null);
    const [argumentVisibility, setArgumentVisibility] = useState(argument.visibility);
    const [argumentRemoved, setArgumentRemoved] = useState(!!argument.isRemoved);

    useEffect(() => {
        setCommentStates(argument.comments?.map((c) => ({ ...c })) ?? []);
    }, [argument.comments]);

    useEffect(() => {
        setArgumentVisibility(argument.visibility);
        setArgumentRemoved(!!argument.isRemoved);
    }, [argument.visibility, argument.isRemoved]);

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

    async function handleDeleteArgument() {
        if (!argument?.id) return;
        setDeletingArgument(true);
        try {
            const res = await fetch("/api/argument", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: argument.id }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to delete argument");
            }
            setArgumentDeleted(true);
            toast.success("Argument deleted");
            router.refresh();
        } catch (err: any) {
            toast.error(err?.message || "Unable to delete argument");
        } finally {
            setDeletingArgument(false);
            setShowArgumentDelete(false);
        }
    }

    async function handleDeleteComment() {
        const commentId = commentDeleteId;
        if (!commentId) return;
        setCommentStates((prev) => prev.map((comment) => (
            comment.id === commentId ? { ...comment, deleting: true } as any : comment
        )));

        try {
            const res = await fetch("/api/comment", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: commentId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to delete comment");
            }
            setCommentStates((prev) => prev.filter((comment) => comment.id !== commentId));
            toast.success("Comment deleted");
        } catch (err: any) {
            console.error("Delete comment error", err);
            toast.error(err?.message || "Unable to delete comment");
            setCommentStates((prev) => prev.map((comment) => (
                comment.id === commentId ? { ...comment, deleting: false } as any : comment
            )));
        } finally {
            setCommentDeleteId(null);
        }
    }

    async function handleRestoreArgument() {
        if (!argument?.id) return;
        setRestoringArgument(true);
        try {
            const res = await fetch("/api/argument", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: argument.id, status: "visible" }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "Failed to restore argument");
            }
            setArgumentVisibility(data?.visibility ?? { status: "visible" });
            setArgumentRemoved(false);
            toast.success("Argument restored");
            router.refresh();
        } catch (err: any) {
            toast.error(err?.message || "Unable to restore argument");
        } finally {
            setRestoringArgument(false);
        }
    }

    async function handleRestoreComment(commentId: string) {
        setRestoringCommentId(commentId);
        try {
            const res = await fetch("/api/comment", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: commentId, status: "visible" }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "Failed to restore comment");
            }
            setCommentStates((prev) => prev.map((comment) => (
                comment.id === commentId
                    ? { ...comment, visibility: data?.visibility ?? { status: "visible" }, isRemoved: false }
                    : comment
            )));
            toast.success("Comment restored");
        } catch (err: any) {
            toast.error(err?.message || "Unable to restore comment");
        } finally {
            setRestoringCommentId(null);
        }
    }

    const createdLabel = useMemo(() => {
        if (!argument?.createdAt) return "";
        return timeAgo(argument.createdAt);
    }, [argument.createdAt]);

    const author = resolveUserSummary(argument.createdBy);
    const authorId = author.id;
    const currentUserId = session?.user?.id;
    const isAdmin = !!session?.user?.isAdmin;
    const canModerate = isAdmin && moderatorMode;
    const ownsArgument = currentUserId && authorId && currentUserId === authorId;
    const canDeleteArgument = ownsArgument || canModerate;
    const argumentStatus = argumentVisibility?.status;
    const argumentStatusLabel = getVisibilityLabel(argumentStatus);
    const canRestoreArgument = canModerate && !argumentRemoved && argumentStatusLabel;
    const showArgumentStatus = moderatorMode && (argumentRemoved || !!argumentStatusLabel);

    if (argumentDeleted) return null;

    return (
        <>
            <div id={`argument-${argument.id}`} className="col-12" key={argument.id}>
                <div className="card h-100 shadow-sm">
                    <div className="card-body">
                        <div className="d-flex align-items-start justify-content-between mb-3">
                            <div className="d-flex flex-column gap-1">
                                <UserIdentity
                                    userId={author.id}
                                    name={author.name}
                                    nickname={author.nickname}
                                    avatarUrl={author.avatarUrl ?? undefined}
                                    avatarThumbUrl={author.avatarThumbUrl ?? undefined}
                                    createdAt={author.createdAt}
                                    size={36}
                                    nameClassName="author-link fw-semibold"
                                    fallbackLabel="Anonymous"
                                    stats={author.stats}
                                />
                                <small className="text-muted d-block">{createdLabel}</small>
                            </div>

                            <div className="d-flex align-items-center gap-2 align-self-end">
                                <button
                                    type="button"
                                    className="badge bg-success-subtle text-success border-0 shadow-none"
                                    onClick={() => sendVote(1)}
                                    disabled={voting}
                                    aria-label="Upvote"
                                >
                                    <i className="fa-solid fa-thumbs-up me-1" aria-hidden="true"></i>
                                    {upvotes}
                                </button>
                                <button
                                    type="button"
                                    className="badge bg-danger-subtle text-danger border-0 shadow-none"
                                    onClick={() => sendVote(-1)}
                                    disabled={voting}
                                    aria-label="Downvote"
                                >
                                    <i className="fa-solid fa-thumbs-down me-1" aria-hidden="true"></i>
                                    {downvotes}
                                </button>
                                <span className="badge text-bg-light">
                                    <i className="fa-regular fa-comments me-1" aria-hidden="true"></i>
                                    {commentStates.length} replies
                                </span>
                                <NotificationSubscribeButton
                                    targetType="argument"
                                    targetId={argument.id}
                                    initialSubscribed={argument.subscription?.isSubscribed}
                                    showLabel={false}
                                />
                                {canDeleteArgument && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-danger btn-sm"
                                        onClick={() => setShowArgumentDelete(true)}
                                        disabled={deletingArgument}
                                        aria-label="Delete argument"
                                    >
                                        {deletingArgument ? "Deleting..." : "Delete"}
                                    </button>
                                )}
                                {canRestoreArgument && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-success btn-sm"
                                        onClick={handleRestoreArgument}
                                        disabled={restoringArgument}
                                        aria-label="Restore argument"
                                    >
                                        {restoringArgument ? "Restoring..." : "Restore"}
                                    </button>
                                )}
                            </div>

                        </div>
                        {showArgumentStatus && (
                            <div className="mb-2 d-flex flex-wrap gap-2">
                                {argumentRemoved && <span className="badge text-bg-secondary">Removed</span>}
                                {argumentStatusLabel && (
                                    <span className="badge text-bg-warning">{argumentStatusLabel}</span>
                                )}
                            </div>
                        )}
                        <p className="mb-2">{argument.body}</p>
                        <EvidenceList evidence={(argument as any).evidence} />
                        {/* Ontology tags removed as not needed */}

                        {/* Comments */}
                        {commentStates.length > 0 && (
                            <div className="mt-3">
                                <h6 className="mb-2">Comments</h6>
                                <ul className="list-unstyled mb-0">
                                    {commentStates.map((c) => {
                                        const commenter = resolveUserSummary(c.createdBy);
                                        const pending = (c as any).pending;
                                        const deleting = (c as any).deleting;
                                        const ownsComment = currentUserId && commenter.id && currentUserId === commenter.id;
                                        const canDeleteComment = ownsComment || canModerate;
                                        const commentStatus = c.visibility?.status;
                                        const commentStatusLabel = getVisibilityLabel(commentStatus);
                                        const commentRemoved = c.isRemoved;
                                        const showCommentStatus = moderatorMode && (commentRemoved || !!commentStatusLabel);
                                        const canRestoreComment = canModerate && !commentRemoved && commentStatusLabel;
                                        return (
                                            <li
                                                id={`comment-${c.id}`}
                                                key={c.id}
                                                className="mb-2 p-2 rounded bg-light border"
                                                style={{ borderLeft: "4px solid #6c757d" }}
                                            >
                                                <div className="d-flex justify-content-between align-items-start mb-2">
                                                    <div className="d-flex flex-wrap align-items-center gap-3">
                                                        <UserIdentity
                                                            userId={commenter.id}
                                                            name={commenter.name}
                                                            nickname={commenter.nickname}
                                                            avatarUrl={commenter.avatarUrl ?? undefined}
                                                            avatarThumbUrl={commenter.avatarThumbUrl ?? undefined}
                                                            createdAt={commenter.createdAt}
                                                            size={28}
                                                            className="small text-muted fw-semibold"
                                                            nameClassName="author-link fw-semibold text-muted"
                                                            fallbackLabel="Anonymous"
                                                            stats={commenter.stats}
                                                        />
                                                        <span className="text-muted small">{c.createdAt ? timeAgo(c.createdAt) : ""}</span>
                                                    </div>
                                                    <div className="d-flex align-items-center gap-2">
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
                                                        {canDeleteComment && (
                                                            <button
                                                                className="btn btn-link btn-sm text-danger p-0"
                                                                onClick={() => setCommentDeleteId(c.id)}
                                                                disabled={deleting}
                                                                aria-label="Delete comment"
                                                            >
                                                                <i className="fa-solid fa-trash me-1" aria-hidden="true"></i>
                                                                {deleting ? "Deleting..." : "Delete"}
                                                            </button>
                                                        )}
                                                        {canRestoreComment && (
                                                            <button
                                                                className="btn btn-link btn-sm text-success p-0"
                                                                onClick={() => handleRestoreComment(c.id)}
                                                                disabled={restoringCommentId === c.id}
                                                                aria-label="Restore comment"
                                                            >
                                                                <i className="fa-solid fa-rotate-left me-1" aria-hidden="true"></i>
                                                                {restoringCommentId === c.id ? "Restoring..." : "Restore"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                {showCommentStatus && (
                                                    <div className="mb-2 d-flex flex-wrap gap-2">
                                                        {commentRemoved && <span className="badge text-bg-secondary">Removed</span>}
                                                        {commentStatusLabel && (
                                                            <span className="badge text-bg-warning">{commentStatusLabel}</span>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="ps-2 mb-2">{c.body}</div>
                                                <div className="ps-2 mb-2">
                                                    <EvidenceList evidence={(c as any).evidence} />
                                                </div>
                                                {/* Ontology tags removed as not needed */}
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
            <ConfirmModal
                isOpen={showArgumentDelete}
                title="Delete argument"
                body={<p className="mb-0">Delete this argument? This cannot be undone.</p>}
                confirmLabel="Delete"
                confirmVariant="danger"
                confirmIconClass="fa-solid fa-trash"
                isBusy={deletingArgument}
                onCancel={() => setShowArgumentDelete(false)}
                onConfirm={handleDeleteArgument}
            />
            <ConfirmModal
                isOpen={!!commentDeleteId}
                title="Delete comment"
                body={<p className="mb-0">Delete this comment? This cannot be undone.</p>}
                confirmLabel="Delete"
                confirmVariant="danger"
                confirmIconClass="fa-solid fa-trash"
                isBusy={commentDeleteId ? Boolean(commentStates.find((c) => c.id === commentDeleteId && (c as any).deleting)) : false}
                onCancel={() => setCommentDeleteId(null)}
                onConfirm={handleDeleteComment}
            />
        </>
    );
}
