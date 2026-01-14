"use client";
import React, { useEffect, useState } from "react";
import TopicCard from "@/app/components/topics/TopicCard";

type TopicItem = {
  _id: string;
  title: string;
  upvoteCount: number;
  downvoteCount: number;
  totalVotes: number;
  creatorName: string;
  ontologyCategories?: Array<{ id: string; label: string; description?: string }>;
};

type ApiResponse = {
  topics: TopicItem[];
  total: number;
};

export default function FeaturedTopics() {
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTopics() {
      try {
        setLoading(true);
        const res = await fetch("/api/topics?page=1&pageSize=6", { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to fetch topics");
        }
        const data: ApiResponse = await res.json();
        setTopics(data.topics);
      } catch (err: any) {
        setError(err?.message || "Failed to load topics");
      } finally {
        setLoading(false);
      }
    }

    fetchTopics();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading topics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-warning" role="alert">
        <i className="fa-solid fa-exclamation-triangle me-2" aria-hidden="true"></i>
        {error}
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="alert alert-info" role="alert">
        <i className="fa-solid fa-info-circle me-2" aria-hidden="true"></i>
        No topics available yet. Be the first to start a debate!
      </div>
    );
  }

  return (
    <div className="row g-3">
      {topics.map((topic) => (
        <TopicCard key={topic._id} topic={topic} />
      ))}
    </div>
  );
}
