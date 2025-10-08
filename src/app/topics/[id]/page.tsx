// app/topics/[id]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import axios from "axios";

type PageProps = {
  params: { id: string };
};

export const dynamic = "force-dynamic"; // ensure it runs server-side each request (optional)

async function getTopic(id: string) {
    const res = await axios.get(`${process.env.NEXTJS_APP_BASE_URL}/api/topics/${id}`);

  const upvoteCount = Array.isArray(res.data.upvotes) ? res.data.upvotes.length : 0;
  const downvoteCount = Array.isArray(res.data.downvotes) ? res.data.downvotes.length : 0;

  return {
    id: String(res.data._id),
    title: res.data.title as string,
    description: (res.data as any).description ?? "",
    creatorName:
      (res.data as any).createdBy?.name ?? "Unknown",
    upvoteCount,
    downvoteCount,
    createdAt: (res.data as any).createdAt as Date | undefined,
  };
}

export default async function TopicPage({ params }: PageProps) {
  const { id } = await params;
  const topic = await getTopic(id);

  if (!topic) {
    notFound();
  }

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
            {topic.title}
          </li>
        </ol>
      </nav>

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <h1 className="h4 card-title mb-2">{topic.title}</h1>
          {topic.description && (
            <p className="card-text">{topic.description}</p>
          )}

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

          <small className="text-muted">
            by {topic.creatorName}
          </small>
        </div>
      </div>

      {/* Placeholder for arguments list you’ll add later */}
      <div className="card">
        <div className="card-body">
          <p className="mb-0 text-muted">
            Arguments and comments will go here…
          </p>
        </div>
      </div>
    </div>
  );
}
