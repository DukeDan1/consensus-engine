import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import FactCard from "@/app/components/topics/FactCard";
export const dynamic = "force-dynamic";

type FactsResponse = {
    topicId: string;
    facts: Array<{
        id: string;
        text: string;
        sourceArgument?: string;
        sourceComment?: string;
        createdAt?: string;
        upvoteCount?: number;
        downvoteCount?: number;
        score?: number;
        latestReassessment?: {
            reassessedAt: string;
            action: string;
            rationale: string;
        };
    }>;
};

type TopicMeta = {
    topic: {
        id: string;
        title: string;
    };
    viewer: {
        canModerate: boolean;
    };
};

async function fetchFacts(id: string, cookieHeader: string): Promise<FactsResponse | null> {
    const base = process.env.NEXTJS_APP_BASE_URL ?? "";
    const url = `${base}/api/topics/${encodeURIComponent(id)}/facts`;
    const res = await fetch(url, { headers: { "Cache-Control": "no-store", cookie: cookieHeader } }).catch(() => null);
    if (!res || !res.ok) return null;
    const data = await res.json();
    return data;
}

async function fetchTopicTitle(id: string, cookieHeader: string): Promise<TopicMeta | null> {
    const base = process.env.NEXTJS_APP_BASE_URL ?? "";
    const url = `${base}/api/topics/${encodeURIComponent(id)}?num_arguments=1&ordering=relevant`;
    const res = await fetch(url, { headers: { "Cache-Control": "no-store", cookie: cookieHeader } }).catch(() => null);
    if (!res) return null;
    const data = await res.json();
    return {
        topic: { id: data.topic?.id ?? id, title: data.topic?.title ?? "" },
        viewer: { canModerate: !!data?.meta?.viewer?.canModerate },
    };
}

export default async function TopicFactsPage({ params }: any) {
    const { id } = await Promise.resolve(params);
    const incomingHeaders = await headers();
    const cookieHeader = incomingHeaders.get("cookie") ?? "";

    const [facts, topicMeta] = await Promise.all([fetchFacts(id, cookieHeader), fetchTopicTitle(id, cookieHeader)]);
    if (!facts || !topicMeta) {
        return notFound();
    }

    const topicId = facts.topicId ?? id;
    const canModerate = topicMeta.viewer.canModerate;

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
                        Facts
                    </li>
                </ol>
            </nav>

            <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
                <div>
                    <h1 className="h4 mb-1">Factual highlights: {topicMeta.topic.title}</h1>
                    <small className="text-muted">Based on AI-backed analysis of the discussion</small>
                </div>
                <div className="d-flex flex-wrap gap-2">
                    <Link href={`/topics/${id}`} className="btn btn-outline-secondary btn-sm">
                        <i className="fa-solid fa-comments me-1" aria-hidden></i>
                        Back to discussion
                    </Link>
                    <Link href={`/topics/${id}/summary`} className="btn btn-outline-primary btn-sm">
                        <i className="fa-solid fa-file-lines me-1" aria-hidden></i>
                        View summary
                    </Link>
                </div>
            </div>

            {facts.facts.length === 0 ? (
                <div className="alert alert-info">No consensus-backed facts have been extracted yet. Check back soon.</div>
            ) : (
                <ul className="list-group">
                    {facts.facts.map((fact) => (
                        <FactCard key={fact.id} fact={fact} topicId={topicId} canModerate={canModerate} />
                    ))}
                </ul>
            )}
        </div>
    );
}
