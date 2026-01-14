"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import UserAvatar from "@/app/components/users/UserAvatar";

type TopicResult = {
  id: string;
  title: string;
};

type UserResult = {
  id: string;
  name?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
};

type SearchResponse = {
  topics: TopicResult[];
  users: UserResult[];
};

function getDisplayName(user: UserResult) {
  return user.name?.trim() || user.nickname?.trim() || "Member";
}

export default function HeaderSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>({ topics: [], users: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trimmedQuery = query.trim();

  const hasResults = results.topics.length > 0 || results.users.length > 0;
  const resultId = useMemo(() => `header-search-results`, []);

  useEffect(() => {
    let active = true;
    if (trimmedQuery.length < 2) {
      setResults({ topics: [], users: [] });
      setLoading(false);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({ topics: [], users: [] }));
        if (!active) return;
        setResults({
          topics: Array.isArray(data?.topics) ? data.topics : [],
          users: Array.isArray(data?.users) ? data.users : [],
        });
        setOpen(true);
      } catch {
        if (!active) return;
        setResults({ topics: [], users: [] });
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmedQuery]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleResultClick() {
    setOpen(false);
    setQuery("");
    setResults({ topics: [], users: [] });
  }

  return (
    <div ref={containerRef} className="position-relative w-100">
      <input
        type="search"
        className="form-control form-control-sm"
        placeholder="Search topics and users"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (trimmedQuery.length >= 2 && (loading || hasResults)) {
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        aria-expanded={open}
        aria-controls={resultId}
      />
      {open && (
        <div
          id={resultId}
          className="position-absolute start-0 end-0 mt-2 bg-white border rounded shadow-sm"
          style={{ zIndex: 1050 }}
        >
          {loading && (
            <div className="px-3 py-2 text-muted small">Searching...</div>
          )}
          {!loading && !hasResults && (
            <div className="px-3 py-2 text-muted small">No results found.</div>
          )}
          {results.topics.length > 0 && (
            <div className="border-top">
              <div className="px-3 pt-2 text-uppercase small text-muted">Topics</div>
              <div className="list-group list-group-flush">
                {results.topics.map((topic) => (
                  <Link
                    key={topic.id}
                    href={`/topics/${topic.id}`}
                    className="list-group-item list-group-item-action"
                    onClick={handleResultClick}
                  >
                    {topic.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {results.users.length > 0 && (
            <div className={results.topics.length > 0 ? "border-top" : undefined}>
              <div className="px-3 pt-2 text-uppercase small text-muted">Users</div>
              <div className="list-group list-group-flush">
                {results.users.map((user) => (
                  <Link
                    key={user.id}
                    href={`/profile/${user.id}`}
                    className="list-group-item list-group-item-action d-flex align-items-center gap-2"
                    onClick={handleResultClick}
                  >
                    <UserAvatar
                      name={getDisplayName(user)}
                      nickname={user.nickname ?? undefined}
                      avatarUrl={user.avatarUrl ?? undefined}
                      size={28}
                    />
                    <span>{getDisplayName(user)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
