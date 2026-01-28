"use client";
import React from "react";
import InteractiveCard from "@/app/components/ui/InteractiveCard";
import OntologyBadgeList from "@/app/components/ontology/OntologyBadgeList";

// Local topic shape for the card to avoid cross-file type coupling
type TopicListItem = {
  _id: string;
  title: string;
  upvoteCount: number;
  downvoteCount: number;
  totalVotes: number;
  argumentCount?: number;
  commentCount?: number;
  creatorName: string;
  ontologyCategories?: Array<{ id: string; label: string; description?: string }>;
};

type Props = {
  topic: TopicListItem;
  isAuthenticated?: boolean;
};

export default function TopTopicCard({ topic, isAuthenticated }: Props) {
  const argumentCount = typeof topic.argumentCount === "number" ? topic.argumentCount : 0;
  const commentCount = typeof topic.commentCount === "number" ? topic.commentCount : 0;

  return (
    <div className="col-12 col-md-6 col-lg-4" key={topic._id}>
      <InteractiveCard
        href={isAuthenticated ? `/topics/${topic._id}` : '/register'}
        className="text-decoration-none text-reset"
        cardClassName="card h-100 shadow-sm card-hover border-0"
      >
        <div className="card-body d-flex flex-column gap-3">
          <div>
            <h2 className="h5 card-title mb-1">{topic.title}</h2>
            <div className="text-muted small">Started by {topic.creatorName}</div>
          </div>
          <OntologyBadgeList categories={topic.ontologyCategories} className="d-flex flex-wrap gap-1" />
          <div className="d-flex flex-wrap gap-2">
            <span className="badge bg-success-subtle text-success">
              <i className="fa-solid fa-thumbs-up me-1" aria-hidden="true"></i>
              {topic.upvoteCount}
            </span>
            <span className="badge bg-danger-subtle text-danger">
              <i className="fa-solid fa-thumbs-down me-1" aria-hidden="true"></i>
              {topic.downvoteCount}
            </span>
            <span className="badge bg-secondary-subtle text-secondary">
              <i className="fa-solid fa-comments me-1" aria-hidden="true"></i>
              {commentCount} replies
            </span>
            <span className="badge bg-primary-subtle text-primary">
              <i className="fa-solid fa-layer-group me-1" aria-hidden="true"></i>
              {argumentCount} posts
            </span>
          </div>
          <div className="mt-auto d-flex align-items-center justify-content-between">
            <small className="text-muted">{topic.totalVotes} total votes</small>
            <span className="text-muted small">
              View
              <i className="fa-solid fa-arrow-right ms-1" aria-hidden="true"></i>
            </span>
          </div>
        </div>
      </InteractiveCard>
    </div>
  );
}
