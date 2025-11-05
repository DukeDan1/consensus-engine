"use client";
import { useEffect, useRef, useState } from "react";
import { TopicApiResponse } from "@/app/types/topicApiResponse";
import AddNewCommentComponent from "@/app/components/AddNewCommentComponent";
import { timeAgo } from "@/app/lib/commonFunctions";


export default function ArgumentCard({ argument }: { argument: TopicApiResponse["arguments"][number] }) {
  const aiAnalysisJustificationRef = useRef<HTMLSpanElement | null>(null);


  useEffect(() => {
    // Initialize Bootstrap tooltip for the AI badge (FACT or OPINION) if present
    if (!aiAnalysisJustificationRef.current || !argument?.aiAnalysis) return;

    let tooltipInstance: any;
    // Import Tooltip from bootstrap's ESM module
    import("bootstrap/js/dist/tooltip")
      .then((mod) => {
        const Tooltip = (mod as any).default ?? (mod as any).Tooltip;
        tooltipInstance = new Tooltip(aiAnalysisJustificationRef.current);
      })
      .catch(() => {
        // ignore if bootstrap not available
      });

    return () => {
      try {
        tooltipInstance?.dispose?.();
      } catch {
        // ignore disposal errors
      }
    };

  }, [argument?.aiAnalysis?.isFact, argument?.aiAnalysis?.isOpinion]);

  const ai = argument.aiAnalysis;
  const [upvotes, setUpvotes] = useState<number>((argument as any).upvoteCount ?? 0);
  const [downvotes, setDownvotes] = useState<number>((argument as any).downvoteCount ?? 0);
  const [voting, setVoting] = useState<boolean>(false);

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

  return (
    <>
        <div className="col-12" key={argument.id}>
          <div className="card h-100 shadow-sm">
            <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="d-flex align-items-center gap-2">
          <span className={`badge ${argument.side === "for" ? "text-bg-success" : "text-bg-danger"}`}>
            {argument.side.toUpperCase()}
                    </span>
                    {ai ? (
                        <>
                        {ai.isFact ? (
                            <span
                            ref={aiAnalysisJustificationRef}
                            className="badge text-bg-purple"
                            data-bs-toggle="tooltip"
                            data-bs-placement="top"
                            title={argument.aiAnalysis?.justification ?? "Classified as FACT by AI"}
                            style={{ cursor: "pointer" }}
                            >
                            FACT
                            </span>
                        ) : ai.isOpinion ? (
                            <span
                                ref={aiAnalysisJustificationRef}
                                className="badge text-bg-info"
                                data-bs-toggle="tooltip"
                                data-bs-placement="top"
                                title={argument.aiAnalysis?.justification ?? "Classified as OPINION by AI"}
                                style={{ cursor: "pointer" }}
                            >
                            OPINION
                            </span>
                        ) : (
                            <span className="badge text-bg-light">UNCLASSIFIED</span>
                        )}
                        </>
                    ) : (
                        <span className="badge text-bg-light">UNCLASSIFIED</span>
                    )}


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

                    <small className="text-muted ms-2">{argument.createdBy?.name ?? "Anonymous"}</small>
                </div>
  
            </div>
                  <p className="mb-3">{argument.body}</p>

                  {/* Comments */}
                {argument.comments.length > 0 && (
                    <div className="mt-3">
                        <h6 className="mb-2">Comments</h6>
                        <ul className="list-unstyled mb-0">
                            {argument.comments.map((c) => {
                                return (
                                    <li
                                        key={c.id}
                                        className="mb-2 p-2 rounded bg-light border"
                                        style={{ borderLeft: "4px solid #6c757d" }}
                                    >
                                        <div className="d-flex justify-content-between align-items-center small text-muted mb-1 fw-semibold">
                                            <span>
                                                <i className="fa-regular fa-user me-1"></i>
                                                {c.createdBy?.name ?? "Anonymous"}
                                            </span>
                                            <span className="ms-2 fw-light small">{c.createdAt ? timeAgo(c.createdAt) : ""}</span>
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
