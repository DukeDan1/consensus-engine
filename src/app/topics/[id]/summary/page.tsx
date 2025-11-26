import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { redirectIfLoggedOut } from "@/app/lib/commonFunctions";

export const dynamic = "force-dynamic";

type SummaryColumn = {
    text: string;
    argument?: string;
    stance: "for" | "against" | "neutral" | string;
    lastUpdatedAt?: string;
};

type TopicSummaryResponse = {
    topicId: string;
    generatedAt: string;
    refreshQueued: boolean;
    points: {
        for: SummaryColumn[];
        against: SummaryColumn[];
        neutral: SummaryColumn[];
    };
};

async function fetchTopicSummary(id: string): Promise<TopicSummaryResponse | null> {
    const base = process.env.NEXTJS_APP_BASE_URL ?? "";
    const url = `${base}/api/topics/${encodeURIComponent(id)}/summary`;
    const incomingHeaders = await headers();
    const res = await fetch(url, { headers: { "Cache-Control": "no-store", cookie: incomingHeaders.get("cookie") ?? "" } }).catch(() => null);
    if (!res) return null;
    const data = await res.json();
    return data;
}

function renderColumn(label: string, items: SummaryColumn[], topicId: string, tone: "success" | "danger" | "secondary") {
    return (
        <div className="col-12 col-lg-4">
            <div className={`card border-${tone} h-100`}>
                <div className={`card-header text-bg-${tone} text-white`}>{label}</div>
                <div className="card-body">
                    {items.length === 0 ? (
                        <p className="text-muted mb-0">No points captured yet.</p>
                    ) : (
                        <ul className="list-unstyled mb-0">
                            {items.map((item, idx) => (
                                <li key={`${item.argument ?? idx}-${label}`} className="mb-3 pb-3 border-bottom">
                                    <p className="mb-2">{item.text}</p>
                                    <div className="d-flex justify-content-between align-items-center">
                                        <small className="text-muted">
                                            AI refreshed {item.lastUpdatedAt ? new Date(item.lastUpdatedAt).toLocaleString() : "recently"}
                                        </small>
                                        <Link
                                            href={`/topics/${topicId}?ordering=relevant${item.argument ? `#argument-${item.argument}` : ""}`}
                                            className="btn btn-outline-secondary btn-sm"
                                        >
                                            Discuss
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

export default async function TopicSummaryPage({ params }: any ) {
    await redirectIfLoggedOut();
    const { id } = await Promise.resolve(params);
    const summary = await fetchTopicSummary(id);
    if (!summary) {
        return notFound();
    }

    const generatedAt = summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : "just now";

    return (
        <div className="container py-4">
            <nav aria-label="breadcrumb" className="mb-3">
                <ol className="breadcrumb mb-0">
                    <li className="breadcrumb-item">
                        <Link href="/">Home</Link>
                    </li>
                    <li className="breadcrumb-item">
                        <Link href="/topics">Topics</Link>
                    </li>
                    <li className="breadcrumb-item">
                        <Link href={`/topics/${id}`}>Discussion</Link>
                    </li>
                    <li className="breadcrumb-item active" aria-current="page">
                        AI summary
                    </li>
                </ol>
            </nav>

            <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
                <div>
                    <h1 className="h4 mb-1">Discussion summary</h1>
                    <small className="text-muted">Last updated {generatedAt}</small>
                </div>
                <div className="d-flex flex-wrap gap-2">
                    <Link href={`/topics/${id}`} className="btn btn-outline-secondary btn-sm">
                        <i className="fa-solid fa-comments me-1" aria-hidden></i>
                        Back to discussion
                    </Link>
                    <Link href={`/topics/${id}/facts`} className="btn btn-outline-primary btn-sm">
                        <i className="fa-solid fa-lightbulb me-1" aria-hidden></i>
                        View facts
                    </Link>
                </div>
            </div>

            {summary.refreshQueued && (
                <div className="alert alert-warning" role="status">
                    Refreshing summary in the background based on the latest discussion. Reload in a moment for updates.
                </div>
            )}

            <div className="row g-3">
                {renderColumn("For", summary.points.for, id, "success")}
                {renderColumn("Against", summary.points.against, id, "danger")}
                {renderColumn("Neutral", summary.points.neutral, id, "secondary")}
            </div>
        </div>
    );
}
