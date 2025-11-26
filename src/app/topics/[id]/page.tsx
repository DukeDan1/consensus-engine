import { notFound } from "next/navigation";
import Link from "next/link";
import { redirectIfLoggedOut } from "@/app/lib/commonFunctions";
import { headers } from "next/headers";
export const dynamic = "force-dynamic"; // render server-side on each request
import { TopicApiResponse } from "@/app/types/topicApiResponse";
import ArgumentCard from "@/app/components/ArgumentCard";
import FactCard from "@/app/components/topics/FactCard";
import OntologyBadgeList from "@/app/components/ontology/OntologyBadgeList";
import TopicDiscussionControls from "@/app/components/topics/TopicDiscussionControls";

function normalizeCategoryParams(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      values
        .flatMap((entry) => entry.split(","))
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

async function fetchTopicBundle(
  id: string,
  ordering: "relevant" | "newest",
  numArguments: number,
  filters: { argumentCategories?: string[]; commentCategories?: string[] },
  requestHeaders: Headers
): Promise<TopicApiResponse | null> {
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const base = host ? `${protocol}://${host}` : process.env.NEXTJS_APP_BASE_URL ?? "";

  const params = new URLSearchParams({
    num_arguments: String(numArguments),
    ordering,
  });
  filters?.argumentCategories?.forEach((categoryId) => params.append("argumentCategory", categoryId));
  filters?.commentCategories?.forEach((categoryId) => params.append("commentCategory", categoryId));
  const url = `${base}/api/topics/${encodeURIComponent(id)}?${params.toString()}`;
  let res: { data: TopicApiResponse } | null = null;

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        cookie: requestHeaders.get("cookie") ?? "",
      },
      cache: "no-store",
    });
    if (response.ok) {
      const data = (await response.json()) as TopicApiResponse;
      res = { data };
    } else {
      console.error("Failed to fetch topic bundle:", response.status, response.statusText);
      res = null;
    }
  } catch (err) {
    console.error("Error fetching topic bundle:", err);
    res = null;
  }
  return res?.data ?? null;
}

export default async function TopicPage({ params, searchParams }: any) {
  await redirectIfLoggedOut();
  const incomingHeaders = await headers();
  const { id } = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const ordering = (resolvedSearchParams?.ordering === "newest" ? "newest" : "relevant") as "relevant" | "newest";
  const numArgs = Math.max(1, Math.min(50, parseInt(resolvedSearchParams?.num_arguments ?? "10", 10) || 10));
  const argumentCategoryIds = Array.from(
    new Set([
      ...normalizeCategoryParams(resolvedSearchParams?.argumentCategory),
      ...normalizeCategoryParams(resolvedSearchParams?.argumentCategories),
    ])
  );
  const commentCategoryIds = Array.from(
    new Set([
      ...normalizeCategoryParams(resolvedSearchParams?.commentCategory),
      ...normalizeCategoryParams(resolvedSearchParams?.commentCategories),
    ])
  );

  const data = await fetchTopicBundle(id, ordering, numArgs, {
    argumentCategories: argumentCategoryIds,
    commentCategories: commentCategoryIds,
  }, incomingHeaders);
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
            <Link href="/topics">Topics</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {t.title}
          </li>
        </ol>
      </nav>

      <div className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-3">
        <div>
          <h1 className="h4 mb-1">{t.title}</h1>
          <small className="text-muted">Started by {t.createdBy?.name ?? "Unknown"}</small>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link href={`/topics/${id}/summary`} className="btn btn-outline-primary btn-sm">
            <i className="fa-solid fa-file-lines me-1" aria-hidden></i>
            Summary view
          </Link>
          <Link href={`/topics/${id}/facts`} className="btn btn-outline-secondary btn-sm">
            <i className="fa-solid fa-lightbulb me-1" aria-hidden></i>
            Facts view
          </Link>
          <div className="btn-group btn-group-sm" role="group" aria-label="Ordering">
            <Link
              href={{
                pathname: `/topics/${id}`,
                query: {
                  ordering: "relevant",
                  num_arguments: String(numArgs),
                  ...(argumentCategoryIds.length ? { argumentCategory: argumentCategoryIds } : {}),
                  ...(commentCategoryIds.length ? { commentCategory: commentCategoryIds } : {}),
                },
              }}
              className={`btn btn-outline-secondary ${data.meta.ordering === "relevant" ? "active" : ""}`}
            >
              Top
            </Link>
            <Link
              href={{
                pathname: `/topics/${id}`,
                query: {
                  ordering: "newest",
                  num_arguments: String(numArgs),
                  ...(argumentCategoryIds.length ? { argumentCategory: argumentCategoryIds } : {}),
                  ...(commentCategoryIds.length ? { commentCategory: commentCategoryIds } : {}),
                },
              }}
              className={`btn btn-outline-secondary ${data.meta.ordering === "newest" ? "active" : ""}`}
            >
              New
            </Link>
          </div>
        </div>
      </div>

      {t.description && <p className="text-muted mb-2">{t.description}</p>}
      <OntologyBadgeList categories={t.ontologyCategories} className="mb-3 d-flex flex-wrap gap-1" />
      <hr className="my-4" />
      <div className="mb-4">
        <TopicDiscussionControls
          topicId={t.id}
          argumentCategoryIds={argumentCategoryIds}
          commentCategoryIds={commentCategoryIds}
        />
      </div>

      {/* Derived Facts */}
      {Array.isArray(data.facts) && data.facts.length > 0 && (
        <div className="mt-5">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="mb-0">Recent factual highlights</h5>
            <Link href={`/topics/${id}/facts`} className="btn btn-link btn-sm">
              View all facts
              <i className="fa-solid fa-arrow-right ms-1" aria-hidden></i>
            </Link>
          </div>
          <ul className="list-group mb-4">
            {data.facts.slice(0, 3).map((f) => (
              <FactCard fact={f} key={f.id} topicId={t.id} />
            ))}
          </ul>
        </div>
      )}

      {/* Arguments */}
      {data.arguments.length === 0 ? (
        <div className="alert alert-secondary">No arguments yet.</div>
      ) : (
        <div className="row g-3">
          <div className="col-12">
            <h5 className="mb-3">Arguments</h5>
          </div>
          {data.arguments.map((a) => (
            <ArgumentCard argument={a} key={a.id} />
          ))}
        </div>
      )}
    </div>
  );
}
