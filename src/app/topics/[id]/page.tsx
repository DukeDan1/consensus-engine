import { notFound } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { redirectIfLoggedOut } from "@/app/lib/commonFunctions";
export const dynamic = "force-dynamic"; // render server-side on each request
import { TopicApiResponse } from "@/app/types/topicApiResponse";
import ArgumentCard from "@/app/components/ArgumentCard";
import AddNewArgumentComponent from "@/app/components/AddNewArgumentComponent";

async function fetchTopicBundle(id: string, ordering: "relevant" | "newest", numArguments: number): Promise<TopicApiResponse | null> {
  const base = process.env.NEXTJS_APP_BASE_URL ?? "";
  const url = `${base}/api/topics/${encodeURIComponent(id)}?num_arguments=${numArguments}&ordering=${ordering}`;
  const res = await axios.get(url, { headers: { "Cache-Control": "no-store" } }).catch(() => null);
  return res?.data ?? null;
}

export default async function TopicPage({ params, searchParams }: any) {
  await redirectIfLoggedOut();
  const { id } = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const ordering = (resolvedSearchParams?.ordering === "newest" ? "newest" : "relevant") as "relevant" | "newest";
  const numArgs = Math.max(1, Math.min(50, parseInt(resolvedSearchParams?.num_arguments ?? "10", 10) || 10));

  const data = await fetchTopicBundle(id, ordering, numArgs);
  if (!data) return notFound();

  const t = data.topic;

  return (
    <div className="container py-4">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0">
          <li className="breadcrumb-item">
            <Link href="/">Home</Link>
          </li>
          <li className="breadcrumb-item">
            <Link href="/app">Topics</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {t.title}
          </li>
        </ol>
      </nav>

      <div className="d-flex align-items-center justify-content-between mb-2">
        <h1 className="h4 mb-0">{t.title}</h1>
        <div className="btn-group btn-group-sm" role="group" aria-label="Ordering">
          <Link
            href={{ pathname: `/topics/${id}`, query: { ordering: "relevant", num_arguments: String(numArgs) } }}
            className={`btn btn-outline-secondary ${data.meta.ordering === "relevant" ? "active" : ""}`}
          >
            Relevant
          </Link>
          <Link
            href={{ pathname: `/topics/${id}`, query: { ordering: "newest", num_arguments: String(numArgs) } }}
            className={`btn btn-outline-secondary ${data.meta.ordering === "newest" ? "active" : ""}`}
          >
            Newest
          </Link>
        </div>
      </div>

      {t.description && <p className="text-muted mb-2">{t.description}</p>}
      {Array.isArray(t.tags) && t.tags.length > 0 && (
        <div className="mb-3">
          {t.tags.map((tag) => (
            <span key={tag} className="badge text-bg-light border me-1">{tag}</span>
          ))}
        </div>
      )}
      <small className="text-muted d-block mb-4">by {t.createdBy?.name ?? "Unknown"}</small>
      <div className="mb-4">
        <AddNewArgumentComponent topicId={t.id} />
      </div>

      {/* Arguments */}
      {data.arguments.length === 0 ? (
        <div className="alert alert-secondary">No arguments yet.</div>
      ) : (
        <div className="row g-3">
          {data.arguments.map((a) => (
            <ArgumentCard argument={a} key={a.id} />
          ))}
        </div>
      )}
    </div>
  );
}
