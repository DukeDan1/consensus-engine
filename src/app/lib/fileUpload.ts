export type UploadResponse = {
  url: string;
  storageUrl?: string;
  fileName?: string;
  contentType?: string;
};

export async function uploadFileViaApi(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/uploads", {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || "Upload failed");
  }
  return data as UploadResponse;
}

export async function deleteFileViaApi(url: string) {
  const res = await fetch("/api/uploads", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Delete failed");
  }
  return data;
}
