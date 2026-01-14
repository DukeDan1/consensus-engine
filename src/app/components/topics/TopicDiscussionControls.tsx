"use client";

import { useMemo, useState } from "react";
import AddNewArgumentComponent from "@/app/components/AddNewArgumentComponent";
import TopicContentFilters from "@/app/components/topics/TopicContentFilters";

export default function TopicDiscussionControls({
  topicId,
  argumentQuery,
  commentQuery,
}: {
  topicId: string;
  argumentQuery: string;
  commentQuery: string;
}) {
  const [showFilters, setShowFilters] = useState(() => Boolean(argumentQuery) || Boolean(commentQuery));
  const [argumentFormOpen, setArgumentFormOpen] = useState(false);
  const filtersPanelId = useMemo(() => `topic-discussion-filters-${topicId}`, [topicId]);
  const controlsShouldStack = argumentFormOpen || showFilters;

  return (
    <div>
      <div className={`d-flex flex-wrap gap-2 align-items-start ${controlsShouldStack ? "flex-column" : ""}`}>
        <div className={`flex-grow-1 ${controlsShouldStack ? "w-100" : "flex-md-grow-0"}`}>
          <AddNewArgumentComponent topicId={topicId} onOpenChange={setArgumentFormOpen} />
        </div>
        <button
          type="button"
          className={`btn btn-outline-secondary ${controlsShouldStack ? "w-100" : ""}`}
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
          <TopicContentFilters argumentQuery={argumentQuery} commentQuery={commentQuery} />
        </div>
      )}
    </div>
  );
}
