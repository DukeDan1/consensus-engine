"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export type SummaryItem = {
  text: string;
  argument?: string;
  stance: "for" | "against" | "neutral" | string;
  lastUpdatedAt?: string;
  justification?: string;
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

  return (
    <div className="col-12 col-lg-4">
      <div className={`card border-${tone} h-100`}>
        <div className={`card-header text-bg-${tone} text-white`}>{label}</div>
        <div className="card-body">
          {items.length === 0 ? (
            <p className="text-muted mb-0">No points captured yet.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {items.map((item, idx) => (
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
