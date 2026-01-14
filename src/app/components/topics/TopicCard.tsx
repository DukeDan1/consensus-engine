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
  creatorName: string;
  ontologyCategories?: Array<{ id: string; label: string; description?: string }>;
};

type Props = {
  topic: TopicListItem;
  isAuthenticated?: boolean;
};

export default function TopTopicCard({ topic, isAuthenticated }: Props) {
  return (
    <div className="col-12 col-md-6 col-lg-4" key={topic._id}>
      <InteractiveCard
        href={isAuthenticated ? `/topics/${topic._id}` : '/register'}
        className="text-decoration-none text-reset"
        cardClassName="card h-100 shadow-sm card-hover"
      >
        <div className="card-body d-flex flex-column">
          <h2 className="h5 card-title mb-2">{topic.title}</h2>
          <OntologyBadgeList categories={topic.ontologyCategories} className="d-flex flex-wrap gap-1 mb-3" />
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
      </InteractiveCard>
    </div>
  );
}