"use client";

import { useMemo, useState } from "react";

type CollapsibleTextProps = {
  text?: string | null;
  limit?: number;
  id?: string;
  className?: string;
  textClassName?: string;
  buttonClassName?: string;
};

export default function CollapsibleText({
  text,
  limit = 500,
  id,
  className,
  textClassName,
  buttonClassName,
}: CollapsibleTextProps) {
  const [expanded, setExpanded] = useState(false);
  const safeText = typeof text === "string" ? text : "";
  const isLong = safeText.length > limit;

  const visibleText = useMemo(() => {
    if (!isLong || expanded) return safeText;
    return `${safeText.slice(0, limit).trimEnd()}…`;
  }, [expanded, isLong, limit, safeText]);

  if (!safeText) return null;

  return (
    <div className={className}>
      <div id={id} className={textClassName} style={{ whiteSpace: "pre-wrap" }}>
        {visibleText}
      </div>
      {isLong && (
        <button
          type="button"
          className={buttonClassName ?? "btn btn-link btn-sm p-0"}
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls={id}
        >
          {expanded ? "Collapse" : "View full text"}
        </button>
      )}
    </div>
  );
}
