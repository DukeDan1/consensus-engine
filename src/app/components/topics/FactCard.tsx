"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import UserIdentity from "@/app/components/users/UserIdentity";
import ConfirmModal from "@/app/components/ui/ConfirmModal";

/** Convert basic markdown bold and newlines to JSX elements */
function formatRationale(text: string): React.ReactNode[] {
    // Split on **bold** markers
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    const nodes: React.ReactNode[] = [];
    parts.forEach((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            nodes.push(<strong key={i}>{part.slice(2, -2)}</strong>);
        } else {
            // Split on newlines to add line breaks
            const lines = part.split(/\n/);
            lines.forEach((line, j) => {
                if (j > 0) nodes.push(<br key={`${i}-br-${j}`} />);
                if (line) nodes.push(<span key={`${i}-${j}`}>{line}</span>);
            });
        }
    });
    return nodes;
}

type VoteReason = {
    id: string;
    value: 1 | -1;
    reason: string;
    createdAt?: string;
    user?: {
        id: string;
        name?: string | null;
        nickname?: string | null;
        avatarUrl?: string | null;
        avatarThumbUrl?: string | null;
        createdAt?: string | null;
        stats?: {
            posts: number;
            comments: number;
            upvotes: number;
            followers: number;
        };
    } | null;
};

type FactCardProps = {
    fact: {
        id: string;
        text: string;
        sourceArgument?: string;
        sourceComment?: string;
        createdAt?: string;
        upvoteCount?: number;
        downvoteCount?: number;
        score?: number;
        latestReassessment?: {
            reassessedAt: string;
            action: string;
            rationale: string;
        };
    };
    topicId: string;
    canModerate?: boolean;
};

export default function FactCard({ fact, topicId, canModerate = false }: FactCardProps) {
    const { data: session } = useSession();
    const isLoggedIn = Boolean(session?.user?.email);

    const [factText, setFactText] = useState(fact.text);
    const [upvoteCount, setUpvoteCount] = useState(fact.upvoteCount ?? 0);
    const [downvoteCount, setDownvoteCount] = useState(fact.downvoteCount ?? 0);
    const [userVote, setUserVote] = useState<1 | -1 | null>(null);
    const [showReasonInput, setShowReasonInput] = useState(false);
    const [reason, setReason] = useState("");
    const [pendingVoteValue, setPendingVoteValue] = useState<1 | -1 | null>(null);
    const [voting, setVoting] = useState(false);
    const [showRationale, setShowRationale] = useState(false);
    const [showReasons, setShowReasons] = useState(false);
    const [voteReasons, setVoteReasons] = useState<VoteReason[]>([]);
    const [loadingReasons, setLoadingReasons] = useState(false);

    // Moderator controls state
    const [showModEdit, setShowModEdit] = useState(false);
    const [modEditText, setModEditText] = useState(fact.text);
    const [modSaving, setModSaving] = useState(false);
    const [modRemoved, setModRemoved] = useState(false);
    const [reassessing, setReassessing] = useState(false);
    const [reassessResult, setReassessResult] = useState<string | null>(null);
    const [latestReassessment, setLatestReassessment] = useState(fact.latestReassessment);

    // Confirm modal state
    const [confirmDeleteVoteId, setConfirmDeleteVoteId] = useState<string | null>(null);
    const [confirmRemoveFact, setConfirmRemoveFact] = useState(false);
    const [deletingVoteReason, setDeletingVoteReason] = useState(false);

    // Fetch user's existing vote on mount so vote state persists across page reloads
    useEffect(() => {
        if (!isLoggedIn) return;
        let cancelled = false;
        fetch(`/api/fact-vote?factId=${encodeURIComponent(fact.id)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!cancelled && data?.vote) {
                    setUserVote(data.vote.value);
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [fact.id, isLoggedIn]);

    const submitVote = useCallback(async (value: 1 | -1, voteReason?: string) => {
        if (voting) return;
        setVoting(true);
        try {
            const res = await fetch("/api/fact-vote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    factId: fact.id,
                    value,
                    ...(voteReason ? { reason: voteReason } : {}),
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setUpvoteCount(data.upvoteCount);
                setDownvoteCount(data.downvoteCount);
                setUserVote(value);
            }
        } catch {
            // ignore
        } finally {
            setVoting(false);
            setShowReasonInput(false);
            setReason("");
            setPendingVoteValue(null);
        }
    }, [fact.id, voting]);

    const handleVote = useCallback((value: 1 | -1) => {
        if (!isLoggedIn) return;
        setPendingVoteValue(value);
        setShowReasonInput(true);
    }, [isLoggedIn]);

    const handleSubmitWithReason = useCallback(() => {
        if (pendingVoteValue === null) return;
        submitVote(pendingVoteValue, reason.trim() || undefined);
    }, [pendingVoteValue, reason, submitVote]);

    const handleSkipReason = useCallback(() => {
        if (pendingVoteValue === null) return;
        submitVote(pendingVoteValue);
    }, [pendingVoteValue, submitVote]);

    const loadVoteReasons = useCallback(async () => {
        if (loadingReasons) return;
        setLoadingReasons(true);
        try {
            const res = await fetch(`/api/topics/${encodeURIComponent(topicId)}/facts/${encodeURIComponent(fact.id)}`);
            if (res.ok) {
                const data = await res.json();
                setVoteReasons(data.voteReasons ?? []);
            }
        } catch {
            // ignore
        } finally {
            setLoadingReasons(false);
        }
    }, [topicId, fact.id, loadingReasons]);

    const handleToggleReasons = useCallback(() => {
        if (!showReasons && voteReasons.length === 0) {
            loadVoteReasons();
        }
        setShowReasons(!showReasons);
    }, [showReasons, voteReasons.length, loadVoteReasons]);

    // Moderator: delete a vote reason
    const handleDeleteVoteReason = useCallback(async (voteId: string) => {
        setDeletingVoteReason(true);
        try {
            const res = await fetch(
                `/api/topics/${encodeURIComponent(topicId)}/facts/${encodeURIComponent(fact.id)}/votes/${encodeURIComponent(voteId)}`,
                { method: "DELETE" }
            );
            if (res.ok) {
                setVoteReasons((prev) => prev.filter((r) => r.id !== voteId));
            }
        } catch {
            // ignore
        } finally {
            setDeletingVoteReason(false);
            setConfirmDeleteVoteId(null);
        }
    }, [topicId, fact.id]);

    // Moderator: save edited text
    const handleModSave = useCallback(async () => {
        if (modSaving) return;
        setModSaving(true);
        try {
            const res = await fetch(`/api/topics/${encodeURIComponent(topicId)}/facts/${encodeURIComponent(fact.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: modEditText.trim() }),
            });
            if (res.ok) {
                setFactText(modEditText.trim());
                setShowModEdit(false);
            }
        } catch {
            // ignore
        } finally {
            setModSaving(false);
        }
    }, [topicId, fact.id, modEditText, modSaving]);

    // Moderator: remove fact
    const handleModRemove = useCallback(async () => {
        if (modSaving) return;
        setModSaving(true);
        try {
            const res = await fetch(`/api/topics/${encodeURIComponent(topicId)}/facts/${encodeURIComponent(fact.id)}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setModRemoved(true);
            }
        } catch {
            // ignore
        } finally {
            setModSaving(false);
            setConfirmRemoveFact(false);
        }
    }, [topicId, fact.id, modSaving]);

    // Moderator: trigger AI reassessment
    const handleReassess = useCallback(async () => {
        if (reassessing) return;
        setReassessing(true);
        setReassessResult(null);
        try {
            const res = await fetch(`/api/topics/${encodeURIComponent(topicId)}/facts/${encodeURIComponent(fact.id)}`, {
                method: "POST",
            });
            if (res.ok) {
                const data = await res.json();
                const r = data.result;
                setReassessResult(`AI action: ${r?.action ?? "unknown"}${r?.rationale ? " — " + r.rationale : ""}`);
                if (r?.action && r?.rationale) {
                    setLatestReassessment({
                        reassessedAt: new Date().toISOString(),
                        action: r.action,
                        rationale: r.rationale,
                    });
                    setShowRationale(true);
                }
                if (data.updatedFact?.text) {
                    setFactText(data.updatedFact.text);
                }
                if (r?.action === "removed") {
                    setModRemoved(true);
                }
            } else {
                setReassessResult("AI reassessment failed.");
            }
        } catch {
            setReassessResult("AI reassessment failed.");
        } finally {
            setReassessing(false);
        }
    }, [topicId, fact.id, reassessing]);

    if (modRemoved) {
        return (
            <li className="list-group-item text-muted" style={{ opacity: 0.5 }}>
                <em>This fact has been removed.</em>
            </li>
        );
    }

    const hasCommentSource = Boolean(fact.sourceComment);
    const hasArgumentSource = Boolean(fact.sourceArgument);
    const sourceHref = hasCommentSource
        ? `/topics/${encodeURIComponent(topicId)}#comment-${fact.sourceComment}`
        : hasArgumentSource
            ? `/topics/${encodeURIComponent(topicId)}#argument-${fact.sourceArgument}`
            : undefined;
    const sourceLabel = hasCommentSource ? "View source comment" : "View source argument";
    const upvoteReasons = voteReasons.filter((r) => r.value === 1 && r.reason);
    const downvoteReasons = voteReasons.filter((r) => r.value === -1 && r.reason);

    return (
        <li key={fact.id} className="list-group-item">
            <div className="d-flex justify-content-between align-items-start">
                <div style={{ maxWidth: "80%" }}>
                    <strong>Fact:</strong> {factText}
                    <div className="small mt-1">
                        {sourceHref ? (
                            <Link href={sourceHref} className="btn btn-link p-0 align-baseline">
                                {sourceLabel}
                            </Link>
                        ) : (
                            <span className="text-muted">Source unavailable</span>
                        )}
                    </div>

                    {/* Voting controls */}
                    <div className="d-flex align-items-center gap-2 mt-2 flex-wrap">
                        {isLoggedIn ? (
                            <>
                                <button
                                    className={`btn btn-sm ${userVote === 1 ? "btn-success" : "btn-outline-success"}`}
                                    onClick={() => handleVote(1)}
                                    disabled={voting}
                                    title="Upvote this fact"
                                >
                                    <i className="fa-solid fa-thumbs-up me-1" aria-hidden></i>
                                    {upvoteCount}
                                </button>
                                <button
                                    className={`btn btn-sm ${userVote === -1 ? "btn-danger" : "btn-outline-danger"}`}
                                    onClick={() => handleVote(-1)}
                                    disabled={voting}
                                    title="Downvote this fact"
                                >
                                    <i className="fa-solid fa-thumbs-down me-1" aria-hidden></i>
                                    {downvoteCount}
                                </button>
                            </>
                        ) : (
                            <>
                                <span className="text-muted small">
                                    <i className="fa-solid fa-thumbs-up me-1" aria-hidden></i>{upvoteCount}
                                </span>
                                <span className="text-muted small">
                                    <i className="fa-solid fa-thumbs-down me-1" aria-hidden></i>{downvoteCount}
                                </span>
                            </>
                        )}
                        {(upvoteCount > 0 || downvoteCount > 0) && (
                            <button
                                className="btn btn-sm btn-outline-secondary"
                                onClick={handleToggleReasons}
                                title="View community feedback on this fact"
                            >
                                <i className="fa-solid fa-comments me-1" aria-hidden></i>
                                Feedback
                            </button>
                        )}
                        {latestReassessment && (
                            <button
                                className="btn btn-sm btn-outline-info"
                                onClick={() => setShowRationale(!showRationale)}
                                title="View AI reassessment rationale"
                            >
                                <i className="fa-solid fa-robot me-1" aria-hidden></i>
                                AI Review
                            </button>
                        )}
                    </div>

                    {/* Moderator controls */}
                    {canModerate && (
                        <div className="d-flex align-items-center gap-2 mt-2">
                            <button
                                className="btn btn-sm btn-outline-warning"
                                onClick={() => { setShowModEdit(!showModEdit); setModEditText(factText); }}
                                title="Edit this fact"
                            >
                                <i className="fa-solid fa-pen me-1" aria-hidden></i>
                                Edit
                            </button>
                            <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => setConfirmRemoveFact(true)}
                                disabled={modSaving}
                                title="Remove this fact"
                            >
                                <i className="fa-solid fa-trash me-1" aria-hidden></i>
                                Remove
                            </button>
                            <button
                                className="btn btn-sm btn-outline-info"
                                onClick={handleReassess}
                                disabled={reassessing}
                                title="Request AI to reconsider this fact"
                            >
                                <i className="fa-solid fa-robot me-1" aria-hidden></i>
                                {reassessing ? "Reassessing…" : "AI Recheck"}
                            </button>
                        </div>
                    )}

                    {/* Moderator edit form */}
                    {showModEdit && canModerate && (
                        <div className="mt-2 p-2 border rounded bg-light" style={{ maxWidth: 600 }}>
                            <label className="form-label small mb-1 fw-bold">Edit fact text:</label>
                            <textarea
                                className="form-control form-control-sm mb-2"
                                rows={3}
                                maxLength={5000}
                                value={modEditText}
                                onChange={(e) => setModEditText(e.target.value)}
                            />
                            <div className="d-flex gap-2">
                                <button className="btn btn-sm btn-primary" onClick={handleModSave} disabled={modSaving || !modEditText.trim()}>
                                    {modSaving ? "Saving…" : "Save"}
                                </button>
                                <button className="btn btn-sm btn-link" onClick={() => setShowModEdit(false)}>Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* AI reassessment result */}
                    {reassessResult && (
                        <div className="mt-2 alert alert-info small py-1 px-2 mb-0">
                            {formatRationale(reassessResult)}
                        </div>
                    )}

                    {/* Reason input for voting */}
                    {showReasonInput && pendingVoteValue !== null && (
                        <div className="mt-2 p-2 border rounded bg-light" style={{ maxWidth: 500 }}>
                            <label className="form-label small mb-1">
                                Why do you {pendingVoteValue === 1 ? "agree with" : "disagree with"} this fact? <span className="text-muted">(optional)</span>
                            </label>
                            <textarea
                                className="form-control form-control-sm mb-2"
                                rows={2}
                                maxLength={2000}
                                placeholder="Provide a reason for your vote..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                            <div className="d-flex gap-2">
                                <button
                                    className="btn btn-sm btn-primary"
                                    onClick={handleSubmitWithReason}
                                    disabled={voting}
                                >
                                    Submit
                                </button>
                                <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={handleSkipReason}
                                    disabled={voting}
                                >
                                    Skip
                                </button>
                                <button
                                    className="btn btn-sm btn-link"
                                    onClick={() => {
                                        setShowReasonInput(false);
                                        setPendingVoteValue(null);
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Community vote reasons */}
                    {showReasons && (
                        <div className="mt-2 p-2 border rounded bg-light" style={{ maxWidth: 600 }}>
                            <div className="small fw-bold mb-2">
                                <i className="fa-solid fa-comments me-1" aria-hidden></i>
                                Community feedback
                            </div>
                            {loadingReasons && <div className="text-muted small">Loading…</div>}
                            {!loadingReasons && upvoteReasons.length === 0 && downvoteReasons.length === 0 && (
                                <div className="text-muted small">No written feedback yet. Votes have been cast without reasons.</div>
                            )}
                            {upvoteReasons.length > 0 && (
                                <div className="mb-2">
                                    <div className="text-success small fw-bold mb-1">
                                        <i className="fa-solid fa-thumbs-up me-1" aria-hidden></i>
                                        Reasons for agreement ({upvoteReasons.length})
                                    </div>
                                    {upvoteReasons.map((r) => (
                                        <div key={r.id} className="small mb-2 ps-2 border-start border-success" style={{ borderWidth: "2px !important" }}>
                                            <div className="d-flex align-items-center justify-content-between mb-1">
                                                <div className="d-flex align-items-center gap-1">
                                                    {r.user ? (
                                                        <UserIdentity
                                                            userId={r.user.id}
                                                            name={r.user.name}
                                                            nickname={r.user.nickname}
                                                            avatarUrl={r.user.avatarUrl ?? undefined}
                                                            avatarThumbUrl={r.user.avatarThumbUrl ?? undefined}
                                                            createdAt={r.user.createdAt}
                                                            size={20}
                                                            className="small"
                                                            nameClassName="author-link small"
                                                            stats={r.user.stats}
                                                        />
                                                    ) : (
                                                        <span className="text-muted">Anonymous</span>
                                                    )}
                                                    {r.createdAt && (
                                                        <span className="text-muted" style={{ fontSize: "0.7rem" }}>
                                                            · {new Date(r.createdAt).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                                {canModerate && (
                                                    <button
                                                        className="btn btn-sm btn-link text-danger p-0"
                                                        onClick={() => setConfirmDeleteVoteId(r.id)}
                                                        title="Remove this feedback"
                                                    >
                                                        <i className="fa-solid fa-trash-can" style={{ fontSize: "0.7rem" }} aria-hidden></i>
                                                    </button>
                                                )}
                                            </div>
                                            <div>{r.reason}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {downvoteReasons.length > 0 && (
                                <div>
                                    <div className="text-danger small fw-bold mb-1">
                                        <i className="fa-solid fa-thumbs-down me-1" aria-hidden></i>
                                        Reasons for disagreement ({downvoteReasons.length})
                                    </div>
                                    {downvoteReasons.map((r) => (
                                        <div key={r.id} className="small mb-2 ps-2 border-start border-danger" style={{ borderWidth: "2px !important" }}>
                                            <div className="d-flex align-items-center justify-content-between mb-1">
                                                <div className="d-flex align-items-center gap-1">
                                                    {r.user ? (
                                                        <UserIdentity
                                                            userId={r.user.id}
                                                            name={r.user.name}
                                                            nickname={r.user.nickname}
                                                            avatarUrl={r.user.avatarUrl ?? undefined}
                                                            avatarThumbUrl={r.user.avatarThumbUrl ?? undefined}
                                                            createdAt={r.user.createdAt}
                                                            size={20}
                                                            className="small"
                                                            nameClassName="author-link small"
                                                            stats={r.user.stats}
                                                        />
                                                    ) : (
                                                        <span className="text-muted">Anonymous</span>
                                                    )}
                                                    {r.createdAt && (
                                                        <span className="text-muted" style={{ fontSize: "0.7rem" }}>
                                                            · {new Date(r.createdAt).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                                {canModerate && (
                                                    <button
                                                        className="btn btn-sm btn-link text-danger p-0"
                                                        onClick={() => setConfirmDeleteVoteId(r.id)}
                                                        title="Remove this feedback"
                                                    >
                                                        <i className="fa-solid fa-trash-can" style={{ fontSize: "0.7rem" }} aria-hidden></i>
                                                    </button>
                                                )}
                                            </div>
                                            <div>{r.reason}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Reassessment rationale display */}
                    {showRationale && latestReassessment && (
                        <div className="mt-2 p-2 border rounded bg-light">
                            <div className="small">
                                <strong>
                                    <i className="fa-solid fa-robot me-1" aria-hidden></i>
                                    AI Reassessment
                                    <span className={`badge ms-2 ${latestReassessment.action === "kept" ? "text-bg-success" : latestReassessment.action === "updated" ? "text-bg-warning" : "text-bg-danger"}`}>
                                        {latestReassessment.action}
                                    </span>
                                </strong>
                                <p className="mb-1 mt-1">{formatRationale(latestReassessment.rationale)}</p>
                                <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                                    Reviewed: {new Date(latestReassessment.reassessedAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
                <span className="badge text-bg-light">AI</span>
            </div>

            <ConfirmModal
                isOpen={confirmDeleteVoteId !== null}
                title="Remove Feedback"
                body="Remove this community feedback comment? The vote itself will be preserved."
                confirmLabel="Remove"
                confirmVariant="danger"
                confirmIconClass="fa-solid fa-trash-can"
                isBusy={deletingVoteReason}
                onConfirm={() => confirmDeleteVoteId && handleDeleteVoteReason(confirmDeleteVoteId)}
                onCancel={() => setConfirmDeleteVoteId(null)}
            />
            <ConfirmModal
                isOpen={confirmRemoveFact}
                title="Remove Fact"
                body="Remove this fact? It will no longer be visible to users."
                confirmLabel="Remove"
                confirmVariant="danger"
                confirmIconClass="fa-solid fa-trash-can"
                isBusy={modSaving}
                onConfirm={handleModRemove}
                onCancel={() => setConfirmRemoveFact(false)}
            />
        </li>
    );
}