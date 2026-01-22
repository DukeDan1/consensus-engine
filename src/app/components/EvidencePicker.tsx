import type { ChangeEvent } from "react";
import type { EvidenceItem } from "@/app/lib/evidence";

type Props = {
  evidence: EvidenceItem[];
  evidenceLink: string;
  onEvidenceLinkChange: (_value: string) => void;
  onAddLink: () => void;
  onFileChange: (_e: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (_index: number) => void;
  maxItems: number;
  canAddMore: boolean;
  maxLabelWidth?: number;
};

export default function EvidencePicker({
  evidence,
  evidenceLink,
  onEvidenceLinkChange,
  onAddLink,
  onFileChange,
  onRemove,
  maxItems,
  canAddMore,
  maxLabelWidth = 280,
}: Props) {
  return (
    <div className="mb-3">
      <label className="form-label">
        Evidence <span className="text-muted small">(up to {maxItems})</span>
      </label>
      <div className="d-flex gap-2 mb-2">
        <input
          className="form-control"
          placeholder="Add a link to evidence"
          value={evidenceLink}
          onChange={(e) => onEvidenceLinkChange(e.target.value)}
          disabled={!canAddMore}
        />
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={onAddLink}
          disabled={!canAddMore || !evidenceLink.trim()}
        >
          Add link
        </button>
      </div>
      <div className="mb-2">
        <label className="form-label small">Upload a file <span className="text-muted small">(Max 30MB per file)</span></label>
        <input type="file" className="form-control" onChange={onFileChange} multiple disabled={!canAddMore} />
      </div>
      {evidence.length > 0 && (
        <div className="small text-muted">
          Attached:
          <ul className="list-unstyled mb-0 mt-1">
            {evidence.map((ev, idx) => (
              <li key={`${ev.url}-${idx}`} className="d-flex align-items-center gap-2">
                <span className="text-truncate" style={{ maxWidth: `${maxLabelWidth}px` }}>
                  {ev.fileName || ev.url}
                </span>
                <button
                  type="button"
                  className="btn btn-link btn-sm text-danger p-0"
                  onClick={() => onRemove(idx)}
                  aria-label="Remove attachment"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
