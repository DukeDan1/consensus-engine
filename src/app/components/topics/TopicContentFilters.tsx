"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function TopicContentFilters({
  argumentQuery,
  commentQuery,
}: {
  argumentQuery: string;
  commentQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [argumentText, setArgumentText] = useState(argumentQuery);
  const [commentText, setCommentText] = useState(commentQuery);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setArgumentText(argumentQuery);
  }, [argumentQuery]);

  useEffect(() => {
    setCommentText(commentQuery);
  }, [commentQuery]);

  function setLoadingUpdateRouter(params: URLSearchParams) {
    const qs = params.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    const current = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (target === current) return;
    setSubmitting(true);
    router.push(target);
  }

  function applyFilters() {
    const params = new URLSearchParams(searchParams?.toString() || "");
    const nextArgument = argumentText.trim();
    const nextComment = commentText.trim();

    if (nextArgument) {
      params.set("argumentQuery", nextArgument);
    } else {
      params.delete("argumentQuery");
    }

    if (nextComment) {
      params.set("commentQuery", nextComment);
    } else {
      params.delete("commentQuery");
    }

    setLoadingUpdateRouter(params);
  }

  function resetFilters() {
    setArgumentText("");
    setCommentText("");
    const params = new URLSearchParams(searchParams?.toString() || "");
    ["argumentQuery", "commentQuery"].forEach((key) => params.delete(key));
    setLoadingUpdateRouter(params);
  }

  useEffect(() => {
    setSubmitting(false);
  }, [searchParams?.toString()]);

  return (
    <section className="card border-0 shadow-sm mb-4">
      <form
        className="card-body"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <h2 className="h6 mb-3">Search discussion content</h2>
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <label className="form-label">Arguments</label>
            <input
              className="form-control"
              placeholder="Search argument text"
              value={argumentText}
              onChange={(event) => setArgumentText(event.target.value)}
            />
          </div>
          <div className="col-12 col-lg-6">
            <label className="form-label">Comments</label>
            <input
              className="form-control"
              placeholder="Search comment text"
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
            />
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 mt-3">
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Applying..." : "Apply filters"}
          </button>
          <button className="btn btn-outline-secondary" type="button" onClick={resetFilters} disabled={submitting}>
            Reset
          </button>
        </div>
      </form>
    </section>
  );
}
