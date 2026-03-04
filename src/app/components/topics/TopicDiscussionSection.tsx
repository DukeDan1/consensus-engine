"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TopicDiscussionControls from "@/app/components/topics/TopicDiscussionControls";
import TopicArgumentList from "@/app/components/topics/TopicArgumentList";
import FactCard from "@/app/components/topics/FactCard";
import { TopicApiResponse } from "@/app/types/topicApiResponse";

type Props = {
  topicId: string;
  argumentQuery: string;
  commentQuery: string;
  moderatorMode?: boolean;
  canModerate?: boolean;
  viewerId?: string;
  arguments: TopicApiResponse["arguments"];
  facts?: TopicApiResponse["facts"];
};

export default function TopicDiscussionSection({
  topicId,
  argumentQuery,
  commentQuery,
  moderatorMode = false,
  canModerate = false,
  viewerId,
  arguments: initialArguments,
  facts,
}: Props) {
  const [argumentState, setArgumentState] = useState(initialArguments);

  useEffect(() => {
    setArgumentState(initialArguments);
  }, [initialArguments]);

  const handleOptimisticAdd = useCallback((argument: TopicApiResponse["arguments"][number]) => {
    setArgumentState((prev) => [argument, ...prev]);
  }, []);

  const handleOptimisticResolve = useCallback((
    tempId: string,
    argument: TopicApiResponse["arguments"][number]
  ) => {
    setArgumentState((prev) => {
      const idx = prev.findIndex((item) => item.id === tempId);
      if (idx === -1) return [argument, ...prev];
      const next = [...prev];
      next[idx] = argument;
      return next;
    });
  }, []);

  const handleOptimisticReject = useCallback((tempId: string) => {
    setArgumentState((prev) => prev.filter((item) => item.id !== tempId));
  }, []);

  return (
    <>
      <div className="mb-4">
        <TopicDiscussionControls
          topicId={topicId}
          argumentQuery={argumentQuery}
          commentQuery={commentQuery}
          onOptimisticArgumentAdd={handleOptimisticAdd}
          onOptimisticArgumentResolve={handleOptimisticResolve}
          onOptimisticArgumentReject={handleOptimisticReject}
        />
      </div>
      {Array.isArray(facts) && facts.length > 0 && (
        <div className="mt-5">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="mb-0">Recent factual highlights</h5>
            <Link href={`/topics/${encodeURIComponent(topicId)}/facts`} className="btn btn-link btn-sm">
              View all facts
              <i className="fa-solid fa-arrow-right ms-1" aria-hidden></i>
            </Link>
          </div>
          <ul className="list-group mb-4">
            {facts.slice(0, 3).map((fact) => (
              <FactCard fact={fact} key={fact.id} topicId={topicId} canModerate={canModerate} />
            ))}
          </ul>
        </div>
      )}
      <div className="row g-3">
        <div className="col-12">
          <h5 className="mb-3">Posts</h5>
        </div>
      </div>
      <TopicArgumentList
        arguments={argumentState}
        moderatorMode={moderatorMode}
        topicId={topicId}
        viewerId={viewerId}
      />
    </>
  );
}
