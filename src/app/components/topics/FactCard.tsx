"use client";

import Link from "next/link";

type FactCardProps = {
    fact: {
        id: string;
        text: string;
        sourceArgument: string;
        createdAt?: string;
    };
    topicId: string;
};

export default function FactCard({ fact, topicId }: FactCardProps) {
    const hasSource = Boolean(fact.sourceArgument);
    const argumentHref = hasSource
        ? `/topics/${encodeURIComponent(topicId)}#argument-${fact.sourceArgument}`
        : undefined;

    return (
        <li key={fact.id} className="list-group-item">
            <div className="d-flex justify-content-between align-items-start">
                <div style={{ maxWidth: "80%" }}>
                    <strong>Fact:</strong> {fact.text}
                    <div className="small mt-1">
                        {argumentHref ? (
                            <Link href={argumentHref} className="btn btn-link p-0 align-baseline">
                                View source argument
                            </Link>
                        ) : (
                            <span className="text-muted">Source argument unavailable</span>
                        )}
                    </div>
                </div>
                <span className="badge text-bg-light">AI</span>
            </div>
        </li>
    );
}