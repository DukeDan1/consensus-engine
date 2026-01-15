import { deleteFileFromUrl } from "@/app/services/gcsService";

export type EvidenceLike = {
  url?: string | null;
  previewUrl?: string | null;
  originalUrl?: string | null;
  originalPreviewUrl?: string | null;
  kind?: "link" | "file" | null;
};

function collectEvidenceUrls(evidenceItems: EvidenceLike[] = []) {
  const urls = evidenceItems
    .filter((item) => item?.kind === "file")
    .flatMap((item) => [item?.url, item?.previewUrl, item?.originalUrl, item?.originalPreviewUrl])
    .map((value) => String(value))
    .filter(Boolean);
  return Array.from(new Set(urls));
}

export async function deleteEvidenceFiles(evidenceItems: EvidenceLike[] = []) {
  const urls = collectEvidenceUrls(evidenceItems);
  if (urls.length === 0) return { deleted: 0 };

  const results = await Promise.allSettled(urls.map((url) => deleteFileFromUrl(url)));
  const failures: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failures.push(urls[index]);
      return;
    }
    if (!result.value?.deleted) {
      failures.push(urls[index]);
    }
  });

  if (failures.length > 0) {
    throw new Error(`Failed to delete ${failures.length} attachment(s).`);
  }

  return { deleted: urls.length };
}

export async function deleteEvidenceFilesForDocuments(docs: Array<{ evidence?: EvidenceLike[] | null }>) {
  const urls = Array.from(new Set(docs.flatMap((doc) => collectEvidenceUrls(doc?.evidence ?? []))));
  if (urls.length === 0) return { deleted: 0 };

  const results = await Promise.allSettled(urls.map((url) => deleteFileFromUrl(url)));
  const failures: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failures.push(urls[index]);
      return;
    }
    if (!result.value?.deleted) {
      failures.push(urls[index]);
    }
  });

  if (failures.length > 0) {
    throw new Error(`Failed to delete ${failures.length} attachment(s).`);
  }

  return { deleted: urls.length };
}
