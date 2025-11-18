"use client";
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import TopTopicCard from "@/app/components/topics/TopicCard";
import CreateNewTopic from "@/app/components/topics/CreateNewTopic";
import TopicFilters, { TopicFiltersValue } from "@/app/components/topics/TopicFilters";
import SearchLoading from "@/app/components/topics/SearchLoading";
import { OntologyCategoryOption } from "@/app/components/ontology/OntologyCategoryPicker";

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
  ontologyCategories?: OntologyCategoryOption[];
};

type ApiResponse = {
  topics: TopicItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function buildQuery(params: Record<string, string | number | string[] | undefined>) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === "" || v === null) return;
    if (Array.isArray(v)) {
      v.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") {
          usp.append(k, item);
        }
      });
      return;
    }
    usp.set(k, String(v));
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
  const [filters, setFilters] = useState<TopicFiltersValue>({ q: "", categories: [] });
  const [page, setPage] = useState(1);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const pageSize = 15;

  const categoryKey = useMemo(() => (filters.categories || []).map((cat) => cat.id).sort().join(","), [filters.categories]);
  const normalizedQuery = (filters.q || "").trim();
  const hasActiveFilters = normalizedQuery !== "" || (filters.categories?.length ?? 0) > 0;

  const fetchFn = useMemo(() => {
    return async () => {
      const term = filters.q;
      const categoryIds = (filters.categories || []).map((cat) => cat.id);
      const qs = buildQuery({ q: term, creator: term, page, pageSize, categoryId: categoryIds });
      const res = await fetch(`/api/topics?${qs}`, { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to fetch topics");
      }
      const data: ApiResponse = await res.json();
      return data;
    };
  }, [filters.q, page, refreshCounter, categoryKey]);

  const { data, loading, error, setData } = useAsync<ApiResponse>(fetchFn, [fetchFn]);

  // Expose a refresh method
  useImperativeHandle(ref, () => ({
    refresh: () => {
      // Trigger re-fetch by incrementing refresh counter
      setRefreshCounter((c) => c + 1);
    },
  }));

  const handleTopicCreated = (created: TopicItem) => {
    setPage(1);
    setData((prev) => {
      if (!prev) return prev;
      const dedup = prev.topics.filter((t) => t._id !== created._id);
      const nextTopics = [{ ...created } as TopicItem, ...dedup];
      return { ...prev, topics: nextTopics.slice(0, prev.pageSize) };
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      <div className="d-flex justify-content-center mt-4">
        <nav aria-label="Topics pages">
          <ul className="pagination pagination-sm mb-0">
            {items}
          </ul>
        </nav>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <div className="d-flex flex-wrap gap-2 align-items-start">
          <div className="flex-grow-1 flex-md-grow-0">
            <CreateNewTopic onCreated={handleTopicCreated} />
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setShowFilters((prev) => !prev)}
            aria-expanded={showFilters}
            aria-controls="topics-filter-panel"
          >
            <i className="fa-solid fa-filter me-1" aria-hidden="true"></i>
            {showFilters ? "Hide filters" : "Filter"}
            {hasActiveFilters && !showFilters ? " (active)" : ""}
          </button>
        </div>
      </div>

      {showFilters && (
        <div id="topics-filter-panel" className="mb-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <TopicFilters value={filters} onChange={setFilters} onSearch={onSearch} />
            </div>
          </div>
        </div>
      )}

      {loading && <SearchLoading />}
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
