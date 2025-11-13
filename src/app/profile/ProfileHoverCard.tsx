"use client";

import InteractiveCard from "@/app/components/ui/InteractiveCard";
import React from "react";

type Stat = {
  iconClass: string;
  value: number | string;
  textClassName?: string;
};

type ProfileHoverCardProps = {
  href?: string;
  topLabel: string;
  timestamp?: string;
  body: string;
  stats: Stat[];
  quote?: string;
  cardClassName?: string;
};

export default function ProfileHoverCard({
  href,
  topLabel,
  timestamp,
  body,
  stats,
  quote,
  cardClassName,
}: ProfileHoverCardProps) {
  const wrapperClass = href ? "text-decoration-none text-reset" : undefined;

  return (
    <InteractiveCard
      href={href}
      className={wrapperClass}
      cardClassName={["card border-0 shadow-sm h-100", cardClassName].filter(Boolean).join(" ")}
    >
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="text-muted small">{topLabel}</span>
          <span className="text-muted small">{timestamp}</span>
        </div>
        {quote && <p className="text-muted small fst-italic mb-2">“{quote}”</p>}
        <p className="mb-3 text-body">{body}</p>
        <div className="d-flex gap-3 small text-muted">
          {stats.map((stat, index) => (
            <span key={index}>
              <i className={`${stat.iconClass} me-1 ${stat.textClassName ?? ""}`} aria-hidden="true"></i>
              {stat.value}
            </span>
          ))}
        </div>
      </div>
    </InteractiveCard>
  );
}
