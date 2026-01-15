"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export type SummaryItem = {
  text: string;
  argument?: string;
  stance: "for" | "against" | "neutral" | string;
  lastUpdatedAt?: string;
  justification?: string;
  upvoteCount?: number;
  downvoteCount?: number;
  factPromotion?: {
    status?: "none" | "candidate" | "promoted" | "demoted";
    reason?: string;
    uniqueVoters?: number;
    netVotes?: number;
  };
};

export default function SummaryColumnCard({
  label,
  items,
  topicId,
  tone,
}: {
  label: string;
  items: SummaryItem[];
  topicId: string;
  tone: "success" | "danger" | "secondary";
}) {
  const tooltipRefs = useRef<Array<HTMLElement | null>>([]);
  const tooltipInstances = useRef<any[]>([]);
  const { data: session } = useSession();
  const [localItems, setLocalItems] = useState(items);
  const [votingById, setVotingById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const setupTooltips = async () => {
      const Tooltip = (await import("bootstrap/js/dist/tooltip")).default;

      tooltipInstances.current.forEach((instance) => instance.dispose());
      tooltipInstances.current = [];

      items.forEach((_item, idx) => {
        const el = tooltipRefs.current[idx];
        if (el) {
          tooltipInstances.current.push(new Tooltip(el));
        }
      });
    };

    setupTooltips();

    return () => {
      tooltipInstances.current.forEach((instance) => instance.dispose());
      tooltipInstances.current = [];
    };
  }, [items]);

  useEffect(() => {
    setLocalItems(items);
    setVotingById({});
  }, [items]);

  async function handleVote(argumentId: string, value: 1 | -1) {
    if (!argumentId) return;
    if (!session?.user) return;
    if (votingById[argumentId]) return;
    setVotingById((prev) => ({ ...prev, [argumentId]: true }));
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "Argument", targetId: argumentId, value }),
      });
      if (!res.ok) throw new Error("Vote failed");
      const json = await res.json();
      setLocalItems((prev) => prev.map((item) => {
        if (item.argument !== argumentId) return item;
        return {
          ...item,
          upvoteCount: typeof json.upvoteCount === "number" ? json.upvoteCount : item.upvoteCount,
          downvoteCount: typeof json.downvoteCount === "number" ? json.downvoteCount : item.downvoteCount,
          factPromotion: json.factPromotion ?? item.factPromotion,
        };
      }));
    } catch (err) {
      console.error("Vote error", err);
    } finally {
      setVotingById((prev) => ({ ...prev, [argumentId]: false }));
    }
  }

  function renderPromotionBadge(item: SummaryItem) {
    const status = item.factPromotion?.status;
    if (status === "promoted") {
      return <span className="badge text-bg-success">Fact</span>;
    }
    if (status === "candidate") {
      return <span className="badge text-bg-warning text-dark">Fact candidate</span>;
    }
    if (status === "demoted") {
      return <span className="badge text-bg-secondary">Demoted</span>;
    }
    return null;
  }

  return (
    <div className="col-12 col-lg-4">
      <div className={`card border-${tone} h-100`}>
        <div className={`card-header text-bg-${tone} text-white`}>{label}</div>
        <div className="card-body">
          {localItems.length === 0 ? (
            <p className="text-muted mb-0">No points captured yet.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {localItems.map((item, idx) => (
                <li key={`${item.argument ?? idx}-${label}`} className="mb-3 pb-3 border-bottom">
                  <p className="mb-2">{item.text || "AI summary unavailable."}</p>
                  <div className="mb-2">
                    <span
                      ref={(el) => {
                        tooltipRefs.current[idx] = el;
                      }}
                      className="badge text-bg-info-subtle text-dark border"
                      data-bs-toggle="tooltip"
                      data-bs-placement="top"
                      title={item.justification || "AI justification not provided."}
                    >
                      AI generated
                    </span>
                  </div>
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                    <div className="btn-group btn-group-sm" role="group" aria-label="Vote on fact promotion">
                      <button
                        type="button"
                        className="btn btn-outline-success"
                        disabled={!session?.user || votingById[item.argument ?? ""]}
                        onClick={() => handleVote(item.argument ?? "", 1)}
                        title="Upvote to support promoting this into a fact"
                      >
                        <i className="fa-solid fa-thumbs-up me-1" aria-hidden></i>
                        {item.upvoteCount ?? 0}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        disabled={!session?.user || votingById[item.argument ?? ""]}
                        onClick={() => handleVote(item.argument ?? "", -1)}
                        title="Downvote to oppose promoting this into a fact"
                      >
                        <i className="fa-solid fa-thumbs-down me-1" aria-hidden></i>
                        {item.downvoteCount ?? 0}
                      </button>
                    </div>
                    <span className="small text-muted">
                      Net {(item.upvoteCount ?? 0) - (item.downvoteCount ?? 0)}
                    </span>
                    {renderPromotionBadge(item)}
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <small className="text-muted">
                      Updated {item.lastUpdatedAt ? new Date(item.lastUpdatedAt).toLocaleString() : "recently"}
                    </small>
                    <Link
                      href={`/topics/${topicId}?ordering=relevant${item.argument ? `#argument-${item.argument}` : ""}`}
                      className="btn btn-outline-secondary btn-sm"
                    >
                      Discuss
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
