"use client";
import Link from "next/link";
import React, { useState } from "react";
import { TopTopic } from "@/app/app/page";

type Props = {
  topic: TopTopic;
};

export default function TopTopicCard({ topic }: Props) {
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  const baseStyle: React.CSSProperties = {
    transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
    transform: "translateY(0) scale(1)",
    boxShadow: "0 0.125rem 0.25rem rgba(0,0,0,0.05)",
  };

  const hoveredStyle: React.CSSProperties = hovered
    ? { transform: "translateY(-4px) scale(1.01)", boxShadow: "0 0.5rem 1rem rgba(0,0,0,0.08)" }
    : {};

  const activeStyle: React.CSSProperties = active
    ? { transform: "translateY(-2px) scale(0.998)", boxShadow: "0 0.25rem 0.5rem rgba(0,0,0,0.12)" }
    : {};

  const combinedStyle = { ...baseStyle, ...hoveredStyle, ...activeStyle };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      setActive(true);
      window.setTimeout(() => setActive(false), 180);
    }
  };

  return (
    <div className="col-12 col-md-6 col-lg-4" key={topic._id}>
      <Link
        href={`/topics/${topic._id}`}
        className="text-decoration-none text-reset"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setActive(false);
        }}
        onMouseDown={() => setActive(true)}
        onMouseUp={() => setActive(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => {
          setHovered(false);
          setActive(false);
        }}
        onKeyDown={handleKeyDown}
        role="link"
      >
        <div className="card h-100 shadow-sm card-hover" style={combinedStyle}>
          <div className="card-body d-flex flex-column">
            <h2 className="h5 card-title mb-2">{topic.title}</h2>
            <div className="mb-3">
              <span className="badge bg-success-subtle text-success me-2">
                <i className="fa-solid fa-thumbs-up me-1" aria-hidden="true"></i>
                {topic.upvoteCount}
              </span>
              <span className="badge bg-danger-subtle text-danger">
                <i className="fa-solid fa-thumbs-down me-1" aria-hidden="true"></i>
                {topic.downvoteCount}
              </span>
            </div>
            <div className="mt-auto">
              <small className="text-muted">
                {topic.creatorName} • {topic.totalVotes} total votes
              </small>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}