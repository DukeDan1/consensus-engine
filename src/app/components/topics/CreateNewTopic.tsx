"use client";
import React, { useState } from "react";
import { toast } from "react-toastify";

type CreatedTopic = {
  _id: string;
  title: string;
  upvoteCount: number;
  downvoteCount: number;
  totalVotes: number;
  creatorName: string;
  ontologyCategories?: Array<{ id: string; label: string; description?: string }>;
};

export default function CreateNewTopic({ onCreated }: { onCreated?: (_t: CreatedTopic) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to create topic");
      }
      const data = await res.json();
      const created: CreatedTopic = {
        _id: data._id || data.id,
        title: data.title,
        upvoteCount: data.upvoteCount ?? 0,
        downvoteCount: data.downvoteCount ?? 0,
        totalVotes: data.totalVotes ?? 0,
        creatorName: data.creatorName || "You",
        ontologyCategories: data.ontologyCategories || [],
      };
      setTitle("");
      setDescription("");
      setOpen(false);
      toast.success("Topic created successfully!");
      onCreated?.(created);
    } catch (err: any) {
      setError(err?.message || "Failed to create topic");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {!open ? (
        <button className="btn btn-outline-success" onClick={() => setOpen(true)} aria-label="Add topic">
          <i className="fa-solid fa-plus me-1"></i>
          New Topic
        </button>
      ) : (
        <div className="card shadow-sm mb-3">
          <div className="card-header d-flex align-items-center justify-content-between">
            <strong>Create a new topic</strong>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setOpen(false)} disabled={submitting}>
              Close
            </button>
          </div>
          <div className="card-body">
            {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}
            <form onSubmit={submit}>
              <div className="mb-2">
                <label className="form-label">Title</label>
                <input
                  className="form-control"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={180}
                  required
                />
              </div>
              <div className="mb-2">
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="alert alert-info py-2">
                Ontology categories will be suggested automatically for new topics based on the content you enter.
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Creating..." : "Create"}
                </button>
                <button className="btn btn-outline-secondary" type="button" onClick={() => setOpen(false)} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
