"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import ArgumentCard from "@/app/components/ArgumentCard";
import { TopicApiResponse } from "@/app/types/topicApiResponse";

export default function TopicArgumentList({
  arguments: allArguments,
  moderatorMode = false,
  topicId,
  viewerId,
}: {
  arguments: TopicApiResponse["arguments"];
  moderatorMode?: boolean;
  topicId?: string;
  viewerId?: string;
}) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id || viewerId;
  const [showNoise, setShowNoise] = useState(false);

  const { visibleArguments, noiseArguments } = useMemo(() => {
    if (moderatorMode) {
      return { visibleArguments: allArguments, noiseArguments: [] };
    }

    const isOwner = (argument: TopicApiResponse["arguments"][number]) => {
      const ownerId = argument.createdBy?._id;
      return !!currentUserId && !!ownerId && currentUserId === ownerId;
    };

    const visible = allArguments.filter((argument) => {
      const status = argument.visibility?.status;
      if (status === "noise") return isOwner(argument);
      if (status && status !== "visible") return isOwner(argument);
      return true;
    });

    const noise = allArguments.filter((argument) => {
      if (argument.visibility?.status !== "noise") return false;
      return !isOwner(argument);
    });

    return { visibleArguments: visible, noiseArguments: noise };
  }, [allArguments, moderatorMode, currentUserId]);

  const hiddenNoiseCount = noiseArguments.length;
  const displayedArguments = showNoise ? [...visibleArguments, ...noiseArguments] : visibleArguments;
  const showNoiseToggle = hiddenNoiseCount > 0 && !moderatorMode;
  const emptyMessage = showNoiseToggle && !showNoise
    ? "No visible posts yet."
    : "No posts yet.";

  if (displayedArguments.length === 0) {
    return (
      <div className="row g-3">
        <div className="col-12">
          <div className="alert alert-secondary">{emptyMessage}</div>
        </div>
        {showNoiseToggle && (
          <div className="col-12 d-flex justify-content-center">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
            onClick={() => setShowNoise(true)}
          >
              {`View more posts (${hiddenNoiseCount})`}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="row g-3">
      {displayedArguments.map((argument) => (
        <ArgumentCard
          argument={argument}
          key={argument.id}
          moderatorMode={moderatorMode}
          topicId={topicId}
        />
      ))}
      {showNoiseToggle && (
        <div className="col-12 d-flex justify-content-center">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setShowNoise((prev) => !prev)}
          >
            {showNoise ? "View fewer posts" : `View more posts (${hiddenNoiseCount})`}
          </button>
        </div>
      )}
    </div>
  );
}
