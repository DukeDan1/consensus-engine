"use client";
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import TopTopicCard from "@/app/components/topics/TopicCard";
import CreateNewTopic from "@/app/components/topics/CreateNewTopic";
import TopicFilters, { TopicFiltersValue } from "@/app/components/topics/TopicFilters";

export type TopicsBrowserHandle = {
  refresh: () => void;
};

type TopicItem = {
  _id: string;
  title: string;
  upvoteCount: number;
  downvoteCount: number;
  totalVotes: number;
  creatorName: string;
};

type ApiResponse = {
  topics: TopicItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function buildQuery(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== null) usp.set(k, String(v));
  });
  return usp.toString();
}

function useAsync<T>(fn: () => Promise<T>, deps: any[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    fn()
      .then((res) => {
        if (!ignore) setData(res);
      })
      .catch((err) => {
        if (!ignore) setError(err?.message || "Failed to load");
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, deps);

  return { data, loading, error, setData } as const;
}

const TopicsBrowser = forwardRef<TopicsBrowserHandle, {}>(function TopicsBrowser(_props, ref) {
  const [filters, setFilters] = useState<TopicFiltersValue>({ q: "" });
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchFn = useMemo(() => {
    return async () => {
  // Use a single term for both title and creator filters on the server
  const term = filters.q;
  const qs = buildQuery({ q: term, creator: term, page, pageSize });
      const res = await fetch(`/api/topics?${qs}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to fetch topics");
      }
      const data: ApiResponse = await res.json();
      return data;
    };
  }, [filters.q, page]);

  const { data, loading, error, setData } = useAsync<ApiResponse>(fetchFn, [fetchFn]);

  // Expose a refresh method
  useImperativeHandle(ref, () => ({
    refresh: () => {
      // re-run by triggering dependency change
      setData(null as any);
      // maintain current page and filters
      // By updating page to same value, we can force re-fetch by changing state
      setPage((p) => p);
    },
  }));

  const totalPages = data?.totalPages ?? 0;
  const topics = data?.topics ?? [];

  function onSearch() {
    setPage(1);
  }

  function renderPagination() {
    if (totalPages <= 1) return null;

    const makeBtn = (p: number, label?: string, disabled?: boolean) => (
      <li key={`p-${label || p}`} className={`page-item ${p === page ? "active" : ""} ${disabled ? "disabled" : ""}`}>
        <a
          className="page-link"
          onClick={(e) => {
            e.preventDefault();
            if (disabled || p === page) return;
            setPage(p);
          }}
          href="#"
        >
          {label || p}
        </a>
      </li>
    );

    const items: React.ReactNode[] = [];
    items.push(makeBtn(Math.max(1, page - 1), "Prev", page <= 1));

    const windowSize = 5;
    const start = Math.max(1, page - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    const adjustedStart = Math.max(1, end - windowSize + 1);

    if (adjustedStart > 1) {
      items.push(makeBtn(1));
      if (adjustedStart > 2) items.push(<li key="start-ellipsis" className="page-item disabled"><span className="page-link">…</span></li>);
    }

    for (let p = adjustedStart; p <= end; p++) items.push(makeBtn(p));

    if (end < totalPages) {
      if (end < totalPages - 1) items.push(<li key="end-ellipsis" className="page-item disabled"><span className="page-link">…</span></li>);
      items.push(makeBtn(totalPages));
    }

    items.push(makeBtn(Math.min(totalPages, page + 1), "Next", page >= totalPages));

    return (
      <nav aria-label="Topics pages" className="mt-3">
        <ul className="pagination pagination-sm mb-0">
          {items}
        </ul>
      </nav>
    );
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h2 className="h5 mb-0">Browse</h2>
        <CreateNewTopic onCreated={() => {
          // After creation, reset to first page and refresh
          setPage(1);
        }} />
      </div>

      <div className="mb-3">
        <TopicFilters value={filters} onChange={setFilters} onSearch={onSearch} />
      </div>

      {loading && <div className="text-muted">Loading…</div>}
      {error && <div className="alert alert-danger py-2">{error}</div>}

      {!loading && topics.length === 0 && <p className="text-muted">No topics match your search.</p>}

      <div className="row g-3">
        {topics.map((t) => (
          <TopTopicCard key={t._id} topic={t} />
        ))}
      </div>

      {renderPagination()}
    </div>
  );
});

export default TopicsBrowser;
