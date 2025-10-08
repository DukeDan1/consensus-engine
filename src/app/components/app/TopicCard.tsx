import Link from "next/link";
import { TopTopic } from "@/app/app/page";

type Props = {
  topic: TopTopic;
};

export default function TopTopicCard({ topic }: Props) {
  return (
    <div className="col-12 col-md-6 col-lg-4" key={topic._id}>
      <Link
        href={`/topics/${topic._id}`}
        className="text-decoration-none text-reset"
      >
        <div className="card h-100 shadow-sm card-hover">
          <div className="card-body d-flex flex-column">
            <h2 className="h5 card-title mb-2">{topic.title}</h2>
            <div className="mb-3">
              <span className="badge bg-success-subtle text-success me-2">
                <i className="fa-solid fa-thumbs-up me-1" aria-hidden="true"></i>
                {topic.upvoteCount}
              </span>
              <span className="badge bg-danger-subtle text-danger">
                <i className="fa-solid fa-thumbs-down me-1" aria-hidden="true"></i>
                {topic.downvoteCount}
              </span>
            </div>
            <div className="mt-auto">
              <small className="text-muted">
                {topic.creatorName} • {topic.totalVotes} total votes
              </small>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}