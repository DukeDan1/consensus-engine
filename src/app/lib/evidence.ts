export type EvidenceItem = {
  url: string;
  kind: "link" | "file";
  label?: string;
  fileName?: string;
  contentType?: string;
  previewUrl?: string;
};

export type EvidenceItemInput = {
  url?: string | null;
  kind?: "link" | "file" | string | null;
  label?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  previewUrl?: string | null;
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
      return { url, kind, label, fileName, contentType, previewUrl };
    })
    .filter(Boolean) as EvidenceItem[];

  return cleaned.slice(0, maxItems);
}
