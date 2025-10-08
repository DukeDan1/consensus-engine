import axios from "axios";
import TopTopicCard from "../components/app/TopicCard";

export type TopTopic = {
  _id: string;
  title: string;
  upvoteCount: number;
  downvoteCount: number;
  totalVotes: number;
  creatorName: string;
};

async function getTopTopics(): Promise<TopTopic[]> {
    const res = await axios.get(
        `${process.env.NEXTJS_APP_BASE_URL ?? ""}/api/top-topics`,
        { headers: { "Cache-Control": "no-store" } }
    );
    const data = res.data;

    if (!data) {
        return [];
    }

    return data.topics ?? [];
}

export default async function AppPage() {
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
