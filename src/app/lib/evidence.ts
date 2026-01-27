export type FactCheckVerdict = "verified" | "inaccurate" | "mixed" | "unverified";

export type EvidenceItem = {
  url: string;
  kind: "link" | "file";
  label?: string;
  fileName?: string;
  contentType?: string;
  previewUrl?: string;
  originalUrl?: string;
  originalPreviewUrl?: string;
  blurred?: boolean;
  blurReasons?: string[];
  factCheck?: {
    verdict?: FactCheckVerdict;
    qualityScore?: number;
    confidence?: number;
    summary?: string;
    checkedAt?: string | Date;
    model?: string;
  };
};

export type EvidenceItemInput = {
  url?: string | null;
  kind?: "link" | "file" | string | null;
  label?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  previewUrl?: string | null;
  originalUrl?: string | null;
  originalPreviewUrl?: string | null;
  blurred?: boolean | null;
  blurReasons?: string[] | null;
  factCheck?: {
    verdict?: FactCheckVerdict;
    qualityScore?: number | null;
    confidence?: number | null;
    summary?: string | null;
    checkedAt?: string | Date | null;
    model?: string | null;
  };
};

export function sanitiseEvidence(
  list: EvidenceItemInput[] | undefined | null,
  maxItems = 10
): EvidenceItem[] {
  if (!Array.isArray(list)) return [];
  const cleaned = list
    .map((item) => {
      const url = (item?.url || "").trim();
      if (!url) return null;
      const kind = item?.kind === "file" ? "file" : "link";
      const label = item?.label?.toString().slice(0, 160);
      const fileName = item?.fileName?.toString().slice(0, 160);
      const contentType = item?.contentType?.toString().slice(0, 120);
      const previewUrl = item?.previewUrl?.toString().slice(0, 400);
      const originalUrl = item?.originalUrl?.toString().slice(0, 400);
      const originalPreviewUrl = item?.originalPreviewUrl?.toString().slice(0, 400);
      const blurred = typeof item?.blurred === "boolean" ? item.blurred : undefined;
      const blurReasons = Array.isArray(item?.blurReasons)
        ? item.blurReasons.map((value) => value?.toString?.().slice(0, 80)).filter(Boolean)
        : undefined;
      return {
        url,
        kind,
        label,
        fileName,
        contentType,
        previewUrl,
        originalUrl,
        originalPreviewUrl,
        blurred,
        blurReasons,
        factCheck: item?.factCheck ? {
          verdict: item.factCheck.verdict,
          qualityScore: typeof item.factCheck.qualityScore === "number" ? item.factCheck.qualityScore : undefined,
          confidence: typeof item.factCheck.confidence === "number" ? item.factCheck.confidence : undefined,
          summary: item.factCheck.summary ? String(item.factCheck.summary).slice(0, 400) : undefined,
          checkedAt: item.factCheck.checkedAt ? new Date(item.factCheck.checkedAt) : undefined,
          model: item.factCheck.model ? String(item.factCheck.model).slice(0, 100) : undefined,
        } : undefined,
      };
    })
    .filter(Boolean) as EvidenceItem[];

  return cleaned.slice(0, maxItems);
}
