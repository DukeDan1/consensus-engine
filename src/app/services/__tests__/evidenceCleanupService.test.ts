import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteFileFromUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/services/gcsService", () => ({
  deleteFileFromUrl: deleteFileFromUrlMock,
}));

import { deleteEvidenceFiles, deleteEvidenceFilesForDocuments } from "@/app/services/evidenceCleanupService";

describe("evidenceCleanupService", () => {
  beforeEach(() => {
    deleteFileFromUrlMock.mockReset();
  });

  it("deletes file evidence URLs and skips links", async () => {
    deleteFileFromUrlMock.mockResolvedValue({ deleted: true });
    const result = await deleteEvidenceFiles([
      { kind: "link", url: "https://example.com" },
      { kind: "file", url: "https://storage.googleapis.com/bucket/file-a.txt" },
    ]);

    expect(deleteFileFromUrlMock).toHaveBeenCalledTimes(1);
    expect(result.deleted).toBe(1);
  });

  it("dedupes URLs across documents", async () => {
    deleteFileFromUrlMock.mockResolvedValue({ deleted: true });
    const result = await deleteEvidenceFilesForDocuments([
      { evidence: [{ kind: "file", url: "https://storage.googleapis.com/bucket/file-a.txt" }] },
      { evidence: [{ kind: "file", url: "https://storage.googleapis.com/bucket/file-a.txt" }] },
    ]);

    expect(deleteFileFromUrlMock).toHaveBeenCalledTimes(1);
    expect(result.deleted).toBe(1);
  });

  it("throws when deletion fails", async () => {
    deleteFileFromUrlMock.mockResolvedValue({ deleted: false });
    await expect(deleteEvidenceFiles([{ kind: "file", url: "https://storage.googleapis.com/bucket/file-a.txt" }]))
      .rejects.toThrow("Failed to delete");
  });
});
