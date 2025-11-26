import TopicsBrowser from "@/app/components/topics/TopicsBrowser";
export const dynamic = "force-dynamic"; // don't prerender; fetch at request time


// Keep type export for compatibility if other components import it
export type TopTopic = {
  _id: string;
  title: string;
  upvoteCount: number;
  downvoteCount: number;
  totalVotes: number;
  creatorName: string;
};

export default async function TopicsPage() {
  return (
    <div className="container py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h1 className="h4 mb-0">Debates</h1>
      </div>

      <TopicsBrowser />

    </div>
  );
}
