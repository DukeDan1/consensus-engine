import { notFound } from "next/navigation";
import Link from "next/link";
import axios from "axios";

type PageProps = {
  params: { id: string };
  searchParams?: { ordering?: string; num_arguments?: string };
};

export const dynamic = "force-dynamic"; // render server-side on each request

type ApiResponse = {
  topic: {
    id: string;
    title: string;
    description?: string;
    createdBy?: { _id: string; name?: string };
    tags?: string[];
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
  arguments: Array<{
    id: string;
    side: "pro" | "con";
    body: string;
    createdBy?: { _id: string; name?: string };
    createdAt?: string;
    comments: Array<{
      id: string;
      body: string;
      createdBy?: { _id: string; name?: string };
      createdAt?: string;
    }>;
  }>;
  meta: { ordering: "relevant" | "newest"; returnedArguments: number; requestedArguments: number };
};

async function fetchTopicBundle(id: string, ordering: "relevant" | "newest", numArguments: number): Promise<ApiResponse | null> {
  const base = process.env.NEXTJS_APP_BASE_URL ?? "";
  const url = `${base}/api/topics/${encodeURIComponent(id)}?num_arguments=${numArguments}&ordering=${ordering}`;
  const res = await axios.get(url, { headers: { "Cache-Control": "no-store" } }).catch(() => null);
  return res?.data ?? null;
}

export default async function TopicPage({ params, searchParams }: PageProps) {
  const { id } = params;
  const resolvedSearchParams = typeof searchParams === "object" && searchParams !== null
    ? searchParams
    : await searchParams;
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

      {/* Arguments */}
      {data.arguments.length === 0 ? (
        <div className="alert alert-secondary">No arguments yet.</div>
      ) : (
        <div className="row g-3">
          {data.arguments.map((a) => (
            <div className="col-12" key={a.id}>
              <div className="card h-100 shadow-sm">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className={`badge ${a.side === "pro" ? "text-bg-success" : "text-bg-danger"}`}>
                      {a.side.toUpperCase()}
                    </span>
                    <small className="text-muted">{a.createdBy?.name ?? "Anonymous"}</small>
                  </div>
                  <p className="mb-3">{a.body}</p>

                  {/* Comments */}
                  {a.comments.length > 0 && (
                    <div className="mt-3">
                      <h6 className="mb-2">Comments</h6>
                      <ul className="list-unstyled mb-0">
                        {a.comments.map((c) => (
                          <li key={c.id} className="mb-2">
                            <div className="small text-muted mb-1">{c.createdBy?.name ?? "Anonymous"}</div>
                            <div>{c.body}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
