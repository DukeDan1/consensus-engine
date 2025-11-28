import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import SummaryColumnCard, { type SummaryItem } from "./SummaryColumnCard";

export const dynamic = "force-dynamic";

type TopicSummaryResponse = {
    topicId: string;
    generatedAt: string;
    points: {
        for: SummaryItem[];
        against: SummaryItem[];
        neutral: SummaryItem[];
    };
};

async function fetchTopicSummary(id: string): Promise<TopicSummaryResponse | null> {
    const base = process.env.NEXTJS_APP_BASE_URL ?? "";
    const url = `${base}/api/topics/${encodeURIComponent(id)}/summary`;
    const incomingHeaders = await headers();
    const res = await fetch(url, { headers: { "Cache-Control": "no-store", cookie: incomingHeaders.get("cookie") ?? "" } }).catch(() => null);
    if (!res || !res.ok) return null;
    const data = await res.json();
    return data;
}

export default async function TopicSummaryPage({ params }: any ) {
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

            <div className="row g-3">
                <SummaryColumnCard label="For" items={summary.points.for} topicId={id} tone="success" />
                <SummaryColumnCard label="Against" items={summary.points.against} topicId={id} tone="danger" />
                <SummaryColumnCard label="Neutral" items={summary.points.neutral} topicId={id} tone="secondary" />
            </div>
        </div>
    );
}
