"use client";
import React, { useState } from "react";

export default function CreateNewTopic({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, tags }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to create topic");
      }
      setTitle("");
      setDescription("");
      setTagsInput("");
      setOpen(false);
      onCreated?.();
    } catch (err: any) {
      setError(err?.message || "Failed to create topic");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {!open ? (
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
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
              <div className="mb-2">
                <label className="form-label">Tags (comma-separated)</label>
                <input
                  className="form-control"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
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
