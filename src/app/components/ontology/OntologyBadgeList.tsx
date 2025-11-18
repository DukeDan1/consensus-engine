"use client";

import { useEffect, useRef } from "react";

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
    let Tooltip: any;

    const setupTooltips = async () => {
      Tooltip = (await import("bootstrap/js/dist/tooltip")).default;
      tooltipInstances.current.forEach((instance) => instance.dispose());
      tooltipInstances.current = [];

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
          title={cat.description || `Category: ${cat.label}`}
        >
          {cat.label}
        </span>
      ))}
    </div>
  );
}
