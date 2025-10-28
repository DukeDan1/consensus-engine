import TopTopicCard from "../components/app/TopicCard";
import { redirectIfLoggedOut } from "../lib/commonFunctions";
import { headers } from "next/headers";

export const dynamic = "force-dynamic"; // don't prerender; fetch at request time


export type TopTopic = {
  _id: string;
  title: string;
  upvoteCount: number;
  downvoteCount: number;
  totalVotes: number;
  creatorName: string;
};

async function getTopTopics(): Promise<TopTopic[]> {
  // Build an absolute base URL at runtime to call our API route
  const h = await headers();
  const host = h.get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const base = process.env.NEXTJS_APP_BASE_URL && process.env.NEXTJS_APP_BASE_URL.length > 0
    ? process.env.NEXTJS_APP_BASE_URL
    : `${protocol}://${host}`;

  try {
    const res = await fetch(`${base}/api/top-topics`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.topics ?? [];
  } catch {
    // On connection errors, return empty to keep page rendering
    return [];
  }
}

export default async function AppPage() {
  // Redirect unauthenticated users before doing any fetches
  await redirectIfLoggedOut();

  const topics = await getTopTopics();

  return (
    <div className="container py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h1 className="h4 mb-0">Top Debates</h1>
        {/* Insert link to create a topic here */}
        {/* <Link className="btn btn-primary btn-sm" href="/topics/new">New Topic</Link> */}
      </div>

    {topics.length === 0 ? (
        <p className="text-muted">No debates yet.</p>
    ) : (
        <div className="row g-3">
            {topics.map((t) => (
                <TopTopicCard topic={t} key={t._id} />
            ))}
        </div>
    )}

    </div>
  );
}
