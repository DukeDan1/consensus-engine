"use client";

import { useEffect, useMemo, useState } from "react";

export type OntologyCategoryOption = {
  id: string;
  label: string;
  description?: string;
};

function formatLabel(label?: string) {
  if (!label) return "";
  const cleaned = label.replace(/\s*\(medtop:[^)]+\)/gi, "").trim();
  return cleaned.length > 0 ? cleaned : label;
}

type Props = {
  selected: OntologyCategoryOption[];
  onChange: (_next: OntologyCategoryOption[]) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  maxVisibleSuggestions?: number;
};

export default function OntologyCategoryPicker({
  selected,
  onChange,
  label,
  placeholder = "Type to search ontology categories…",
  helperText,
  maxVisibleSuggestions = 6,
}: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<OntologyCategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected]);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/ontology/categories?q=${encodeURIComponent(query)}&limit=50`, { cache: "no-store" })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to load categories");
        }
        return res.json();
      })
      .then((data) => {
        if (!active || !data) return;
        setSuggestions((data.categories || []) as OntologyCategoryOption[]);
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || "Failed to load categories");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query]);

  function addCategory(option: OntologyCategoryOption) {
    if (selectedIds.has(option.id)) return;
    onChange([...selected, option]);
    setQuery("");
    setSuggestions([]);
  }

  function removeCategory(id: string) {
    onChange(selected.filter((item) => item.id !== id));
  }

  const visibleSuggestions = suggestions
    .filter((item) => !selectedIds.has(item.id))
    .slice(0, maxVisibleSuggestions);

  return (
    <div className="ontology-category-picker">
      {label && <label className="form-label fw-semibold">{label}</label>}
      <div className="mb-2">
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {helperText && <small className="text-muted">{helperText}</small>}
      </div>

      {selected.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-2">
          {selected.map((item) => (
            <span key={item.id} className="badge bg-primary-subtle text-primary d-flex align-items-center gap-1">
              <span>{formatLabel(item.label)}</span>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-primary"
                onClick={() => removeCategory(item.id)}
                aria-label={`Remove ${item.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {loading && <div className="text-muted small">Searching…</div>}
      {error && <div className="text-danger small">{error}</div>}

      {!loading && !error && visibleSuggestions.length > 0 && (
        <div className="list-group mb-2">
          {visibleSuggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="list-group-item list-group-item-action"
              onClick={() => addCategory(item)}
            >
              <div className="fw-semibold">{formatLabel(item.label)}</div>
              {item.description && <div className="small text-muted">{item.description}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
