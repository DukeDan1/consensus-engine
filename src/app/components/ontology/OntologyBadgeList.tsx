"use client";

import { useEffect, useRef } from "react";
import { cleanOntologyLabel } from "@/app/lib/ontologyUtils";

type OntologyBadge = {
  id: string;
  label: string;
  description?: string;
};

export default function OntologyBadgeList({
  categories,
  className,
  badgeClassName,
}: {
  categories?: OntologyBadge[] | null;
  className?: string;
  badgeClassName?: string;
}) {
  const tooltipRefs = useRef<Array<HTMLElement | null>>([]);
  const tooltipInstances = useRef<any[]>([]);

  useEffect(() => {
    const setupTooltips = async () => {
      // Import tooltip library first
      const Tooltip = (await import("bootstrap/js/dist/tooltip")).default;
      
      // Dispose of any existing tooltip instances
      tooltipInstances.current.forEach((instance) => instance.dispose());
      tooltipInstances.current = [];

      // Create new tooltip instances after import completes
      (categories || []).forEach((_cat, idx) => {
        const el = tooltipRefs.current[idx];
        if (el) {
          tooltipInstances.current.push(new Tooltip(el));
        }
      });
    };

    setupTooltips();

    return () => {
      tooltipInstances.current.forEach((instance) => instance.dispose());
      tooltipInstances.current = [];
    };
  }, [categories]);
  if (!categories || categories.length === 0) return null;

  return (
    <div className={className ?? "d-flex flex-wrap gap-1"}>
      {categories.map((cat, idx) => (
        <span
          key={`${cat.id}-${idx}`}
          ref={(el) => {
            tooltipRefs.current[idx] = el;
          }}
          className={`badge text-bg-light border ${badgeClassName ?? ""}`.trim()}
          data-bs-toggle="tooltip"
          data-bs-placement="top"
          title={cat.description || `Category: ${cleanOntologyLabel(cat.label) || cat.label}`}
        >
          {cleanOntologyLabel(cat.label) || cat.label}
        </span>
      ))}
    </div>
  );
}
