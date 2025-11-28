"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import OntologyCategoryPicker, { OntologyCategoryOption } from "@/app/components/ontology/OntologyCategoryPicker";

async function fetchCategoriesByIds(ids: string[]): Promise<OntologyCategoryOption[]> {
  if (!ids.length) return [];
  const params = new URLSearchParams();
  ids.forEach((id) => params.append("id", id));
  params.set("limit", String(ids.length));
  const res = await fetch(`/api/ontology/categories?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  return data?.categories ?? [];
}

function usePreloadedSelection(ids: string[]) {
  const [selection, setSelection] = useState<OntologyCategoryOption[]>([]);
  const key = useMemo(() => ids.slice().sort().join(","), [ids]);

  useEffect(() => {
    let active = true;
    if (!ids.length) {
      setSelection([]);
      return () => {
        active = false;
      };
    }
    fetchCategoriesByIds(ids).then((options) => {
      if (!active) return;
      setSelection(options);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return [selection, setSelection] as const;
}

export default function TopicOntologyFilters({
  argumentCategoryIds,
  commentCategoryIds,
}: {
  argumentCategoryIds: string[];
  commentCategoryIds: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [argumentSelection, setArgumentSelection] = usePreloadedSelection(argumentCategoryIds);
  const [commentSelection, setCommentSelection] = usePreloadedSelection(commentCategoryIds);
  const [submitting, setSubmitting] = useState(false);

  function setLoadingUpdateRouter(params: URLSearchParams) {
    const qs = params.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    const current = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (target === current) return; // nothing to do

    setSubmitting(true);
    router.push(target);
  }

  function applyFilters() {
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("argumentCategory");
    params.delete("argumentCategories");
    params.delete("commentCategory");
    params.delete("commentCategories");

    argumentSelection.forEach((cat) => params.append("argumentCategory", cat.id));
    commentSelection.forEach((cat) => params.append("commentCategory", cat.id));
    setLoadingUpdateRouter(params);
  }

  function resetFilters() {
    setArgumentSelection([]);
    setCommentSelection([]);
    const params = new URLSearchParams(searchParams?.toString() || "");
    ["argumentCategory", "argumentCategories", "commentCategory", "commentCategories"].forEach((key) => params.delete(key));
    setLoadingUpdateRouter(params);
  }

  useEffect(() => {
    // When the URL search params change (navigate), stop loading spinner
    setSubmitting(false);
  }, [searchParams?.toString()]);

  return (
    <section className="card border-0 shadow-sm mb-4">
      <div className="card-body">
        <h2 className="h6 mb-3">Filter discussion by ontology categories</h2>
        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <OntologyCategoryPicker
              selected={argumentSelection}
              onChange={setArgumentSelection}
              label="Argument categories"
              helperText="Only show arguments that match these categories"
            />
          </div>
          <div className="col-12 col-lg-6">
            <OntologyCategoryPicker
              selected={commentSelection}
              onChange={setCommentSelection}
              label="Comment categories"
              helperText="Only show comments that match these categories"
            />
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 mt-3">
          <button className="btn btn-primary" type="button" onClick={applyFilters} disabled={submitting}>
            {submitting ? "Applying…" : "Apply filters"}
          </button>
          <button className="btn btn-outline-secondary" type="button" onClick={resetFilters} disabled={submitting}>
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}
