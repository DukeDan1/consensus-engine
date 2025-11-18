"use client";

import { useMemo, useState } from "react";
import AddNewArgumentComponent from "@/app/components/AddNewArgumentComponent";
import TopicOntologyFilters from "@/app/components/topics/TopicOntologyFilters";

export default function TopicDiscussionControls({
  topicId,
  argumentCategoryIds,
  commentCategoryIds,
}: {
  topicId: string;
  argumentCategoryIds: string[];
  commentCategoryIds: string[];
}) {
  const [showFilters, setShowFilters] = useState(() => argumentCategoryIds.length > 0 || commentCategoryIds.length > 0);
  const filtersPanelId = useMemo(() => `topic-discussion-filters-${topicId}`, [topicId]);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-start">
        <div className="flex-grow-1 flex-md-grow-0">
          <AddNewArgumentComponent topicId={topicId} />
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => setShowFilters((prev) => !prev)}
          aria-expanded={showFilters}
          aria-controls={filtersPanelId}
        >
          <i className="fa-solid fa-filter me-1" aria-hidden="true"></i>
          {showFilters ? "Hide filters" : "Filter"}
        </button>
      </div>
      {showFilters && (
        <div id={filtersPanelId} className="mt-3">
          <TopicOntologyFilters argumentCategoryIds={argumentCategoryIds} commentCategoryIds={commentCategoryIds} />
        </div>
      )}
    </div>
  );
}
