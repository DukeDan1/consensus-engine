import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
export const dynamic = "force-dynamic"; // render server-side on each request
import { TopicApiResponse } from "@/app/types/topicApiResponse";
import TopicDiscussionSection from "@/app/components/topics/TopicDiscussionSection";
import OntologyBadgeList from "@/app/components/ontology/OntologyBadgeList";
import TopicAdminActions from "@/app/components/topics/TopicAdminActions";
import UserIdentity from "@/app/components/users/UserIdentity";
import NotificationSubscribeButton from "@/app/components/notifications/NotificationSubscribeButton";
import { buildBaseUrl } from "@/app/lib/commonFunctions";

async function fetchTopicBundle(
  id: string,
  ordering: "relevant" | "newest",
  numArguments: number,
  filters: { argumentQuery?: string; commentQuery?: string },
  includeModeration: boolean,
  requestHeaders: Headers
): Promise<TopicApiResponse | null> {
  const base = buildBaseUrl(requestHeaders);

  const params = new URLSearchParams({
    num_arguments: String(numArguments),
    ordering,
  });
  if (includeModeration) {
    params.set("includeModeration", "1");
  }
  if (filters?.argumentQuery) {
    params.set("argumentQuery", filters.argumentQuery);
  }
  if (filters?.commentQuery) {
    params.set("commentQuery", filters.commentQuery);
  }
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
  const incomingHeaders = await headers();
  const { id } = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const ordering = (resolvedSearchParams?.ordering === "newest" ? "newest" : "relevant") as "relevant" | "newest";
  const numArgs = Math.max(1, Math.min(50, parseInt(resolvedSearchParams?.num_arguments ?? "10", 10) || 10));
  const argumentQuery = typeof resolvedSearchParams?.argumentQuery === "string"
    ? resolvedSearchParams.argumentQuery.trim()
    : "";
  const commentQuery = typeof resolvedSearchParams?.commentQuery === "string"
    ? resolvedSearchParams.commentQuery.trim()
    : "";
  const moderatorRequested = resolvedSearchParams?.moderator === "1";
  const data = await fetchTopicBundle(id, ordering, numArgs, {
    argumentQuery,
    commentQuery,
  }, moderatorRequested, incomingHeaders);
  if (!data) return notFound();

  const t = data.topic;
  const canModerate = !!data?.meta?.viewer?.canModerate;
  const moderatorMode = moderatorRequested && canModerate;
  const moderatorQuery = moderatorMode ? { moderator: "1" } : {};

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
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span>Started by</span>
            <UserIdentity
              userId={t.createdBy?._id}
              name={t.createdBy?.name}
              nickname={t.createdBy?.nickname}
              avatarUrl={t.createdBy?.avatarUrl ?? undefined}
              avatarThumbUrl={t.createdBy?.avatarThumbUrl ?? undefined}
              createdAt={t.createdBy?.createdAt}
              size={24}
              className="small text-muted"
              nameClassName="author-link text-muted"
              fallbackLabel="Unknown"
              badges={t.createdBy?.isModerator ? [{ label: "MOD", variant: "secondary" }] : undefined}
              tooltipBadges={t.createdBy?.isAdmin ? [{ label: "ADMIN", variant: "danger" }] : undefined}
              stats={t.createdBy?.stats}
            />
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 topic-header-controls">
          <Link href={`/topics/${id}/summary`} className="btn btn-outline-primary btn-sm">
            <i className="fa-solid fa-file-lines me-1" aria-hidden></i>
            <span className="d-none d-sm-inline">Summary</span>
            <span className="d-sm-none">Summary</span>
          </Link>
          <Link href={`/topics/${id}/facts`} className="btn btn-outline-secondary btn-sm">
            <i className="fa-solid fa-lightbulb me-1" aria-hidden></i>
            <span className="d-none d-sm-inline">Facts</span>
            <span className="d-sm-none">Facts</span>
          </Link>
          <NotificationSubscribeButton
            targetType="topic"
            targetId={t.id}
            initialSubscribed={t.subscription?.isSubscribed}
          />
          <div className="btn-group btn-group-sm" role="group" aria-label="Ordering">
            <Link
              href={{
                pathname: `/topics/${id}`,
                query: {
                  ordering: "relevant",
                  num_arguments: String(numArgs),
                  ...(argumentQuery ? { argumentQuery } : {}),
                  ...(commentQuery ? { commentQuery } : {}),
                  ...moderatorQuery,
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
                  ...(argumentQuery ? { argumentQuery } : {}),
                  ...(commentQuery ? { commentQuery } : {}),
                  ...moderatorQuery,
                },
              }}
              className={`btn btn-outline-secondary ${data.meta.ordering === "newest" ? "active" : ""}`}
            >
              New
            </Link>
          </div>
          {canModerate && (
            <Link
              href={{
                pathname: `/topics/${id}`,
                query: {
                  ordering,
                  num_arguments: String(numArgs),
                  ...(argumentQuery ? { argumentQuery } : {}),
                  ...(commentQuery ? { commentQuery } : {}),
                  ...(moderatorMode ? {} : { moderator: "1" }),
                },
              }}
              className={`btn btn-sm ${moderatorMode ? "btn-warning" : "btn-outline-warning"}`}
            >
              <i className="fa-solid fa-shield-halved me-1" aria-hidden></i>
              {moderatorMode ? "Moderator mode on" : "Moderator mode"}
            </Link>
          )}
          <TopicAdminActions topicId={t.id} topicTitle={t.title} enabled={moderatorMode} />
        </div>
      </div>

      {t.description && <p className="text-muted mb-2">{t.description}</p>}
      <OntologyBadgeList categories={t.ontologyCategories} className="mb-3 d-flex flex-wrap gap-1" />
      <hr className="my-4" />
      <TopicDiscussionSection
        topicId={t.id}
        argumentQuery={argumentQuery}
        commentQuery={commentQuery}
        arguments={data.arguments}
        facts={data.facts}
        moderatorMode={moderatorMode}
        canModerate={canModerate}
        viewerId={data.meta.viewer?.id}
      />

    </div>
  );
}
