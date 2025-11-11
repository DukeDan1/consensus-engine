"use client";
import React, { useEffect, useState } from "react";

export type TopicFiltersValue = {
  q: string;
};

export default function TopicFilters({
  value,
  onChange,
  onSearch,
}: {
  value: TopicFiltersValue;
  onChange: (_value: TopicFiltersValue) => void;
  onSearch: () => void;
}) {
  const [q, setQ] = useState(value.q);
  
  useEffect(() => {
    setQ(value.q);
  }, [value.q]);

  return (
    <form
      className="row g-2"
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ q });
        onSearch();
      }}
    >
      <div className="col-12 col-md-10">
        <input
          className="form-control"
          placeholder="Search by topic title or creator name/email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="col-12 col-md-2 d-grid">
        <button className="btn btn-outline-primary" type="submit">
          Search
        </button>
      </div>
    </form>
  );
}
