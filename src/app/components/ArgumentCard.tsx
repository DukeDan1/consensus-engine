"use client";
import { useEffect, useRef, useState } from "react";
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
    isAdmin?: boolean;
    isModerator?: boolean;
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
            isAdmin: !!value.isAdmin,
            isModerator: !!value.isModerator,
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
    if (status === "noise") return "Low visibility";
    return "Hidden";
}

function FactCheckBadge({ factCheck }: { factCheck?: any }) {
    const badgeRef = useRef<HTMLSpanElement | null>(null);
    const verdict = factCheck?.verdict;
    const shouldRender = verdict && verdict !== "unverified";
    const meta =
        verdict === "verified"
            ? { label: "Source verified", className: "text-bg-success" }
            : verdict === "inaccurate"
                ? { label: "Source unreliable", className: "text-bg-danger" }
                : { label: "Source mixed", className: "text-bg-warning" };
    const summary = factCheck?.summary ? String(factCheck.summary).trim() : "";
    const qualityScore = typeof factCheck?.qualityScore === "number" ? Math.round(factCheck.qualityScore) : null;
    const confidence =
        typeof factCheck?.confidence === "number"
            ? `${Math.round(factCheck.confidence * 100)}%`
            : null;
    const detailBits = [
        "Evidence quality only",
        summary ? `Summary: ${summary}` : null,
        qualityScore !== null ? `Quality: ${qualityScore}/100` : null,
        confidence ? `Confidence: ${confidence}` : null,
    ].filter(Boolean);
    const title = detailBits.length ? detailBits.join(" • ") : undefined;

    useEffect(() => {
        if (!shouldRender) return;
        let tooltipInstance: any;
        const setupTooltip = async () => {
            if (!badgeRef.current || !title) return;
            const Tooltip = (await import("bootstrap/js/dist/tooltip")).default;
            tooltipInstance = new Tooltip(badgeRef.current);
        };
        setupTooltip();
        return () => {
            if (tooltipInstance?.dispose) {
                tooltipInstance.dispose();
            }
        };
    }, [title, shouldRender]);

    if (!shouldRender) return null;

    return (
        <span
            ref={badgeRef}
            className={`badge ${meta.className}`}
            data-bs-toggle="tooltip"
            data-bs-placement="top"
            title={title}
        >
            {meta.label}
        </span>
    );
}

function ContentFactCheckNotice({
    factCheck,
    compact = false,
}: {
    factCheck?: any;
    compact?: boolean;
}) {
    if (!factCheck || factCheck?.verdict !== "inaccurate") return null;
    const summary = factCheck?.summary ? String(factCheck.summary).trim() : "";
    const sources = Array.isArray(factCheck?.sources)
        ? factCheck.sources.filter((source: any) => source?.url)
        : [];
    return (
        <div className={`border border-danger-subtle rounded p-2 bg-danger-subtle ${compact ? "small" : ""}`}>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <span className="badge text-bg-danger">Incorrect</span>
                {summary && <span className="text-danger-emphasis">{summary}</span>}
            </div>
            {sources.length > 0 && (
                <div className={`text-danger-emphasis ${compact ? "small" : ""}`}>
                    <div className="fw-semibold">Sources</div>
                    <ul className="mb-0 ps-3">
                        {sources.map((source: any, idx: number) => (
                            <li key={`${source.url}-${idx}`}>
                                <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-decoration-none"
                                >
                                    {source.title || source.url}
                                </a>
                                {source.snippet ? <span className="text-muted"> - {source.snippet}</span> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function RelativeTime({ value }: { value?: string | Date | null }) {
    const [label, setLabel] = useState("");

    useEffect(() => {
        if (!value) {
            setLabel("");
            return;
        }
        setLabel(timeAgo(value as string));
    }, [value]);

    if (!value) return null;
    return (
        <span className="text-muted small" suppressHydrationWarning>
            {label}
        </span>
    );
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
            {item?.factCheck?.verdict && item.factCheck.verdict !== "unverified" ? (
                <div className="mt-1">
                    <FactCheckBadge factCheck={item?.factCheck} />
                </div>
            ) : null}
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
                        <div key={`${url}-${idx}`} className="d-flex align-items-center gap-1 w-100">
                            <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="badge text-bg-secondary text-decoration-none"
                                title={label}
                            >
                                <i className="fa-solid fa-paperclip me-1" aria-hidden="true"></i>
                                {label?.slice(0, 40)}
                            </a>
                            <FactCheckBadge factCheck={item?.factCheck} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


export default function ArgumentCard({
    argument,
    moderatorMode = false,
    topicId,
}: {
    argument: TopicApiResponse["arguments"][number];
    moderatorMode?: boolean;
    topicId?: string;
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
    const [moderatorOverrides, setModeratorOverrides] = useState<Record<string, boolean>>({});
    const [moderatorUpdatingId, setModeratorUpdatingId] = useState<string | null>(null);
    const [showNoiseComments, setShowNoiseComments] = useState(false);

    const addOptimisticComment = (comment: TopicApiResponse["arguments"][number]["comments"][number]) => {
        setCommentStates((prev) => [...prev, { ...comment, pending: true } as any]);
    };

    const resolveOptimisticComment = (
        tempId: string,
        comment: TopicApiResponse["arguments"][number]["comments"][number]
    ) => {
        setCommentStates((prev) => {
            const idx = prev.findIndex((item) => item.id === tempId);
            if (idx === -1) return [...prev, comment];
            const next = [...prev];
            next[idx] = comment as any;
            return next;
        });
    };

    const rejectOptimisticComment = (tempId: string) => {
        setCommentStates((prev) => prev.filter((item) => item.id !== tempId));
    };

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

    async function handleUpdateArgumentVisibility(status: "visible" | "noise") {
        if (!argument?.id) return;
        setRestoringArgument(true);
        try {
            const res = await fetch("/api/argument", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: argument.id, status }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "Failed to update argument");
            }
            setArgumentVisibility(data?.visibility ?? { status });
            setArgumentRemoved(false);
            toast.success(status === "noise" ? "Marked as noise" : "Argument restored");
            router.refresh();
        } catch (err: any) {
            toast.error(err?.message || "Unable to update argument");
        } finally {
            setRestoringArgument(false);
        }
    }

    async function handleUpdateCommentVisibility(commentId: string, status: "visible" | "noise") {
        setRestoringCommentId(commentId);
        try {
            const res = await fetch("/api/comment", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: commentId, status }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "Failed to update comment");
            }
            setCommentStates((prev) => prev.map((comment) => (
                comment.id === commentId
                    ? { ...comment, visibility: data?.visibility ?? { status }, isRemoved: false }
                    : comment
            )));
            toast.success(status === "noise" ? "Marked as noise" : "Comment restored");
        } catch (err: any) {
            toast.error(err?.message || "Unable to update comment");
        } finally {
            setRestoringCommentId(null);
        }
    }

    const author = resolveUserSummary(argument.createdBy);
    const authorId = author.id;
    const currentUserId = session?.user?.id;
    const canModerate = !!moderatorMode;
    const canManageModerators = !!session?.user?.isAdmin && moderatorMode && !!topicId;
    const ownsArgument = currentUserId && authorId && currentUserId === authorId;
    const canDeleteArgument = ownsArgument || canModerate;
    const argumentStatus = argumentVisibility?.status;
    const argumentStatusLabel = getVisibilityLabel(argumentStatus);
    const isArgumentNoise = argumentStatus === "noise";
    const canRestoreArgument = canModerate && !argumentRemoved && argumentStatus && argumentStatus !== "visible" && !isArgumentNoise;
    const canToggleArgumentNoise = canModerate && !argumentRemoved && (argumentStatus === "visible" || isArgumentNoise);
    const showArgumentStatus = moderatorMode && (argumentRemoved || !!argumentStatusLabel);
    const isArgumentPending = Boolean((argument as any).pending);
    const visibleComments = commentStates.filter((comment) => {
        const commenterId = resolveUserSummary(comment.createdBy).id;
        const ownsComment = currentUserId && commenterId && currentUserId === commenterId;
        const status = comment.visibility?.status;
        if (moderatorMode) return true;
        if (status === "noise") return ownsComment;
        if (status && status !== "visible") return ownsComment;
        return true;
    });
    const hiddenNoiseComments = commentStates.filter((comment) => {
        if (moderatorMode) return false;
        if (comment.visibility?.status !== "noise") return false;
        const commenterId = resolveUserSummary(comment.createdBy).id;
        const ownsComment = currentUserId && commenterId && currentUserId === commenterId;
        return !ownsComment;
    });
    const displayedComments = showNoiseComments
        ? [...visibleComments, ...hiddenNoiseComments]
        : visibleComments;
    const hiddenNoiseCount = hiddenNoiseComments.length;

    const getIsModerator = (userId?: string, fallback?: boolean) => {
        if (!userId) return false;
        if (Object.prototype.hasOwnProperty.call(moderatorOverrides, userId)) {
            return !!moderatorOverrides[userId];
        }
        return !!fallback;
    };

    async function handleModeratorToggle(targetId: string | undefined, shouldPromote: boolean, label: string) {
        if (!topicId || !targetId) return;
        setModeratorUpdatingId(targetId);
        try {
            const res = await fetch(`/api/topics/${topicId}/moderators`, {
                method: shouldPromote ? "POST" : "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: targetId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || "Failed to update moderator");
            }
            setModeratorOverrides((prev) => ({ ...prev, [targetId]: shouldPromote }));
            toast.success(shouldPromote
                ? `${label} promoted to moderator.`
                : `${label} removed as moderator.`);
            router.refresh();
        } catch (err: any) {
            toast.error(err?.message || "Unable to update moderator");
        } finally {
            setModeratorUpdatingId(null);
        }
    }

    if (argumentDeleted) return null;

    return (
        <>
            <div id={`argument-${argument.id}`} className="col-12" key={argument.id}>
                <div className="card h-100 shadow-sm">
                    <div className="card-body">
                        <div className="d-flex align-items-start justify-content-between mb-3 argument-card-header">
                            <div className="d-flex flex-column gap-1">
                            <div className="d-flex flex-wrap align-items-center gap-2">
                                {isArgumentPending ? (
                                    <span className="badge text-bg-info">Sending...</span>
                                ) : (
                                    <>
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
                                            badges={getIsModerator(author.id, author.isModerator) ? [{ label: "MOD", variant: "secondary" }] : undefined}
                                            tooltipBadges={author.isAdmin ? [{ label: "ADMIN", variant: "danger" }] : undefined}
                                            stats={author.stats}
                                        />
                                        {canManageModerators && author.id && (
                                            <button
                                                type="button"
                                                className="btn btn-outline-secondary btn-sm"
                                                onClick={() => handleModeratorToggle(
                                                    author.id,
                                                    !getIsModerator(author.id, author.isModerator),
                                                    author.name || author.nickname || "User"
                                                )}
                                                disabled={moderatorUpdatingId === author.id}
                                            >
                                                {getIsModerator(author.id, author.isModerator) ? "Remove Moderator" : "Promote to Moderator"}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                                <RelativeTime value={argument?.createdAt} />
                            </div>

                            <div className="d-flex align-items-center gap-2 argument-actions">
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
                                    <span className="d-none d-sm-inline">{commentStates.length} replies</span>
                                    <span className="d-sm-none">{commentStates.length}</span>
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
                                        <i className="fa-solid fa-trash" aria-hidden="true"></i>
                                        <span className="d-none d-sm-inline ms-1">{deletingArgument ? "Deleting..." : "Delete"}</span>
                                    </button>
                                )}
                                {canRestoreArgument && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-success btn-sm"
                                        onClick={() => handleUpdateArgumentVisibility("visible")}
                                        disabled={restoringArgument}
                                        aria-label="Restore argument"
                                    >
                                        <i className="fa-solid fa-rotate-left" aria-hidden="true"></i>
                                        <span className="d-none d-sm-inline ms-1">{restoringArgument ? "Restoring..." : "Restore"}</span>
                                    </button>
                                )}
                                {canToggleArgumentNoise && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-warning btn-sm"
                                        onClick={() => handleUpdateArgumentVisibility(isArgumentNoise ? "visible" : "noise")}
                                        disabled={restoringArgument}
                                        aria-label={isArgumentNoise ? "Unmark noise" : "Mark noise"}
                                    >
                                        <i className="fa-solid fa-filter" aria-hidden="true"></i>
                                        <span className="d-none d-sm-inline ms-1">{restoringArgument ? "Updating..." : isArgumentNoise ? "Unmark Noise" : "Mark Noise"}</span>
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
                        <ContentFactCheckNotice factCheck={(argument as any).contentFactCheck} />
                        <p className="mb-2 mt-2" style={{ whiteSpace: "pre-wrap" }}>{argument.body}</p>
                        <EvidenceList evidence={(argument as any).evidence} />
                        {/* Ontology tags removed as not needed */}

                        {/* Comments */}
                        {commentStates.length > 0 && (
                            <div className="mt-3">
                                <h6 className="mb-2">Comments</h6>
                                <ul className="list-unstyled mb-0">
                                    {displayedComments.map((c) => {
                                        const commenter = resolveUserSummary(c.createdBy);
                                        const pending = (c as any).pending;
                                        const deleting = (c as any).deleting;
                                        const ownsComment = currentUserId && commenter.id && currentUserId === commenter.id;
                                        const canDeleteComment = ownsComment || canModerate;
                                        const commentStatus = c.visibility?.status;
                                        const commentStatusLabel = getVisibilityLabel(commentStatus);
                                        const commentRemoved = c.isRemoved;
                                        const showCommentStatus = moderatorMode && (commentRemoved || !!commentStatusLabel);
                                        const isCommentNoise = commentStatus === "noise";
                                        const canRestoreComment = canModerate && !commentRemoved && commentStatus && commentStatus !== "visible" && !isCommentNoise;
                                        const canToggleCommentNoise = canModerate && !commentRemoved && (commentStatus === "visible" || isCommentNoise);
                                        const commenterIsModerator = getIsModerator(commenter.id, commenter.isModerator);
                                        return (
                                            <li
                                                id={`comment-${c.id}`}
                                                key={c.id}
                                                className="mb-2 p-2 rounded bg-light border"
                                                style={{ borderLeft: "4px solid #6c757d" }}
                                            >
                                                <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start gap-2 mb-2 comment-item-header">
                                                    <div className="d-flex flex-wrap align-items-center gap-2">
                                                        {pending ? (
                                                            <span className="badge text-bg-info">Sending...</span>
                                                        ) : (
                                                            <>
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
                                                                    badges={commenterIsModerator ? [{ label: "MOD", variant: "secondary" }] : undefined}
                                                                    tooltipBadges={commenter.isAdmin ? [{ label: "ADMIN", variant: "danger" }] : undefined}
                                                                    stats={commenter.stats}
                                                                />
                                                                {canManageModerators && commenter.id && (
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-outline-secondary btn-sm"
                                                                        onClick={() => handleModeratorToggle(
                                                                            commenter.id,
                                                                            !commenterIsModerator,
                                                                            commenter.name || commenter.nickname || "User"
                                                                        )}
                                                                        disabled={moderatorUpdatingId === commenter.id}
                                                                    >
                                                                        <span className="d-none d-sm-inline">{commenterIsModerator ? "Remove Moderator" : "Promote to Moderator"}</span>
                                                                        <span className="d-sm-none">{commenterIsModerator ? "Remove Mod" : "Promote"}</span>
                                                                    </button>
                                                                )}
                                                                <RelativeTime value={c.createdAt} />
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="d-flex flex-wrap align-items-center gap-2 comment-actions">
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
                                                                <i className="fa-solid fa-trash" aria-hidden="true"></i>
                                                                <span className="d-none d-sm-inline ms-1">{deleting ? "Deleting..." : "Delete"}</span>
                                                            </button>
                                                        )}
                                                        {canRestoreComment && (
                                                            <button
                                                                className="btn btn-link btn-sm text-success p-0"
                                                                onClick={() => handleUpdateCommentVisibility(c.id, "visible")}
                                                                disabled={restoringCommentId === c.id}
                                                                aria-label="Restore comment"
                                                            >
                                                                <i className="fa-solid fa-rotate-left" aria-hidden="true"></i>
                                                                <span className="d-none d-sm-inline ms-1">{restoringCommentId === c.id ? "Restoring..." : "Restore"}</span>
                                                            </button>
                                                        )}
                                                        {canToggleCommentNoise && (
                                                            <button
                                                                className="btn btn-link btn-sm text-warning p-0"
                                                                onClick={() => handleUpdateCommentVisibility(c.id, isCommentNoise ? "visible" : "noise")}
                                                                disabled={restoringCommentId === c.id}
                                                                aria-label={isCommentNoise ? "Unmark noise" : "Mark noise"}
                                                            >
                                                                <i className="fa-solid fa-filter" aria-hidden="true"></i>
                                                                <span className="d-none d-sm-inline ms-1">
                                                                    {restoringCommentId === c.id
                                                                        ? "Updating..."
                                                                        : isCommentNoise ? "Unmark Noise" : "Mark Noise"}
                                                                </span>
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
                                                <div className="ps-2 mb-2 mt-2">
                                                    <ContentFactCheckNotice factCheck={(c as any).contentFactCheck} compact />
                                                </div>
                                                <div className="ps-2 mb-2" style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
                                                <div className="ps-2 mb-2">
                                                    <EvidenceList evidence={(c as any).evidence} />
                                                </div>
                                                {/* Ontology tags removed as not needed */}
                                            </li>
                                        );
                                    })}
                                </ul>
                                {hiddenNoiseCount > 0 && !moderatorMode && (
                                    <div className="mt-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary btn-sm"
                                            onClick={() => setShowNoiseComments((prev) => !prev)}
                                        >
                                            {showNoiseComments ? "View less replies" : `View more replies (${hiddenNoiseCount})`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="mt-3">
                            <AddNewCommentComponent
                                argumentId={argument.id}
                                onOptimisticAdd={addOptimisticComment}
                                onOptimisticResolve={resolveOptimisticComment}
                                onOptimisticReject={rejectOptimisticComment}
                            />
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
