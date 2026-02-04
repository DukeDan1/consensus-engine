"use client";

import Link from "next/link";

type FactCardProps = {
    fact: {
        id: string;
        text: string;
        sourceArgument?: string;
        sourceComment?: string;
        createdAt?: string;
    };
    topicId: string;
};

export default function FactCard({ fact, topicId }: FactCardProps) {
    const hasCommentSource = Boolean(fact.sourceComment);
    const hasArgumentSource = Boolean(fact.sourceArgument);
    const sourceHref = hasCommentSource
        ? `/topics/${encodeURIComponent(topicId)}#comment-${fact.sourceComment}`
        : hasArgumentSource
            ? `/topics/${encodeURIComponent(topicId)}#argument-${fact.sourceArgument}`
            : undefined;
    const sourceLabel = hasCommentSource ? "View source comment" : "View source argument";

    return (
        <li key={fact.id} className="list-group-item">
            <div className="d-flex justify-content-between align-items-start">
                <div style={{ maxWidth: "80%" }}>
                    <strong>Fact:</strong> {fact.text}
                    <div className="small mt-1">
                        {sourceHref ? (
                            <Link href={sourceHref} className="btn btn-link p-0 align-baseline">
                                {sourceLabel}
                            </Link>
                        ) : (
                            <span className="text-muted">Source unavailable</span>
                        )}
                    </div>
                </div>
                <span className="badge text-bg-light">AI</span>
            </div>
        </li>
    );
}