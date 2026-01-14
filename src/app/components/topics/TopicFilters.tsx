"use client";
import React, { useEffect, useState } from "react";
import OntologyCategoryPicker, { OntologyCategoryOption } from "@/app/components/ontology/OntologyCategoryPicker";

export type TopicFiltersValue = {
  q: string;
  categories: OntologyCategoryOption[];
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
  const [selectedCategories, setSelectedCategories] = useState<OntologyCategoryOption[]>(value.categories || []);
  
  useEffect(() => {
    setQ(value.q);
  }, [value.q]);

  useEffect(() => {
    setSelectedCategories(value.categories || []);
  }, [value.categories]);

  return (
    <form
      className="row g-2"
      onSubmit={(e) => {
        e.preventDefault();
        onChange({ q, categories: selectedCategories });
        onSearch();
      }}
    >
      <div className="col-12">
        <input
          className="form-control"
          placeholder="Search by topic title or creator name/email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="col-12">
        <OntologyCategoryPicker
          selected={selectedCategories}
          onChange={(next) => {
            setSelectedCategories(next);
          }}
          label="Filter by ontology categories"
          helperText="Includes categories detected in topics, arguments, and comments"
        />
      </div>
      <div className="col-12 col-md-3 d-grid">
        <button className="btn btn-outline-primary" type="submit">
          Apply filters
        </button>
      </div>
      <div className="col-12 col-md-3 d-grid">
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => {
            setQ("");
            setSelectedCategories([]);
            onChange({ q: "", categories: [] });
            onSearch();
          }}
        >
          Reset
        </button>
      </div>
    </form>
  );
}
