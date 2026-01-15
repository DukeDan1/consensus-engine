"use client";

import { useEffect, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import ConfirmModal from "@/app/components/ui/ConfirmModal";
import { deleteFileViaApi, uploadFileViaApi } from "@/app/lib/fileUpload";

type Props = {
  canManage: boolean;
  isOwner: boolean;
  targetUserId: string;
  currentAvatarUrl?: string | null;
  onAvatarUpdated: (_url: string | null) => void;
};

const allowedTypes = ["image/png", "image/jpeg"];
const hairColorOptions = [
  "black",
  "dark brown",
  "brown",
  "light brown",
  "blonde",
  "red",
  "auburn",
  "grey",
  "white",
] as const;
const ethnicityOptions = [
  "East Asian (light to medium skin tone)",
  "South Asian (medium to deep skin tone)",
  "Black (deep skin tone)",
  "White (light skin tone)",
  "Middle Eastern (medium skin tone)",
  "Latino (light to medium skin tone)",
  "Southeast Asian (medium skin tone)",
  "North African (medium to deep skin tone)",
] as const;

export default function ProfileAvatarUploader({
  canManage,
  isOwner,
  targetUserId,
  currentAvatarUrl,
  onAvatarUpdated,
}: Props) {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"upload" | "remove" | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [gender, setGender] = useState<"male" | "female">("male");
  const [age, setAge] = useState(22);
  const [hairColor, setHairColor] = useState<(typeof hairColorOptions)[number]>("brown");
  const [ethnicitySkin, setEthnicitySkin] = useState<(typeof ethnicityOptions)[number]>("White (light skin tone)");

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  if (!canManage) return null;

  const inputsDisabled = isBusy || previewLoading || isGenerating;

  function handleClose() {
    setIsOpen(false);
    setSelectedFile(null);
    setPreviewLoading(false);
  }

  function updateSelectedFile(file: File | null) {
    setSelectedFile(file);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      updateSelectedFile(null);
      return;
    }
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only PNG and JPEG images are supported.");
      e.target.value = "";
      updateSelectedFile(null);
      return;
    }
    updateSelectedFile(file);
  }

  async function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    if (inputsDisabled) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    const imageFile = files.find((file) => file.type.startsWith("image/"));
    if (!imageFile) return;
    e.preventDefault();
    if (!allowedTypes.includes(imageFile.type)) {
      toast.error("Only PNG and JPEG images are supported.");
      return;
    }
    updateSelectedFile(imageFile);
  }

  async function updateAvatar(payload: {
    avatarUrl: string | null;
    avatarThumbUrl: string | null;
    avatarOriginalUrl?: string | null;
    avatarOriginalThumbUrl?: string | null;
    avatarModeration?: {
      status?: "flagged" | "approved" | "removed";
      reasons?: string[];
      flaggedAt?: string;
    } | null;
  }) {
    const endpoint = isOwner ? "/api/user/update" : `/api/admin/users/${targetUserId}`;
    const method = isOwner ? "POST" : "PATCH";
    const res = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || "Failed to update avatar");
    }
    return data;
  }

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/profile/avatar/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender, age, hairColor, ethnicitySkin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate image");
      }
      const base64 = data?.base64;
      if (!base64) {
        throw new Error("No image data returned");
      }
      const blob = await fetch(`data:image/png;base64,${base64}`).then((response) => response.blob());
      const file = new File([blob], `generated-avatar-${Date.now()}.png`, { type: "image/png" });
      updateSelectedFile(file);
    } catch (err: any) {
      toast.error(err?.message || "Unable to generate image");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    if (!selectedFile) {
      toast.error("Select an image to upload.");
      return;
    }
    setIsBusy(true);
    setBusyAction("upload");
    let storedUrl = "";
    let signedUrl = "";
    let previewUrl: string | undefined;
    let originalUrl: string | undefined;
    let originalPreviewUrl: string | undefined;
    let blurred = false;
    let blurReasons: string[] | undefined;
    try {
      const upload = await uploadFileViaApi(selectedFile, { purpose: "avatar" });
      storedUrl = upload.storageUrl || upload.url;
      signedUrl = upload.url || upload.storageUrl || "";
      previewUrl = upload.previewUrl;
      originalUrl = upload.originalUrl || upload.originalSignedUrl;
      originalPreviewUrl = upload.originalPreviewUrl || upload.originalPreviewSignedUrl;
      blurred = !!upload.blurred;
      blurReasons = upload.blurReasons ?? undefined;
      await updateAvatar({
        avatarUrl: storedUrl,
        avatarThumbUrl: previewUrl ?? null,
        avatarOriginalUrl: originalUrl ?? null,
        avatarOriginalThumbUrl: originalPreviewUrl ?? null,
        avatarModeration: blurred
          ? {
              status: "flagged",
              reasons: blurReasons ?? [],
              flaggedAt: new Date().toISOString(),
            }
          : null,
      });

      onAvatarUpdated(signedUrl || storedUrl);
      if (blurred) {
        toast.warn("Your avatar has been flagged by our automated safety system and will be blurred until manually reviewed by a moderator. Consider setting a new avatar or alternatively wait for a manual review.", { autoClose: 20000 });
      }
      toast.success("Avatar updated");
      handleClose();
      await updateSession();
      router.refresh();
    } catch (err: any) {
      if (storedUrl) {
        try {
          await deleteFileViaApi({
            url: storedUrl,
            previewUrl,
            originalUrl,
            originalPreviewUrl,
          });
        } catch (deleteErr) {
          console.error("Failed to delete unused avatar", deleteErr);
        }
      }
      toast.error(err?.message || "Unable to update avatar");
    } finally {
      setIsBusy(false);
      setBusyAction(null);
    }
  }

  async function handleRemove() {
    if (!currentAvatarUrl) return;
    setIsBusy(true);
    setBusyAction("remove");
    try {
      await updateAvatar({
        avatarUrl: null,
        avatarThumbUrl: null,
        avatarOriginalUrl: null,
        avatarOriginalThumbUrl: null,
        avatarModeration: null,
      });
      onAvatarUpdated(null);
      toast.success("Avatar removed");
      handleClose();
      await updateSession();
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Unable to remove avatar");
    } finally {
      setIsBusy(false);
      setBusyAction(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary mt-2"
        onClick={() => setIsOpen(true)}
      >
        <i className="fa-regular fa-image me-1" aria-hidden="true"></i>
        Change avatar
      </button>
      <ConfirmModal
        isOpen={isOpen}
        title="Update avatar"
        dialogClassName="modal-xl"
        body={(
          <div>
            <div className="row g-3">
              <div className="col-12 col-lg-6">
                <div className="border rounded-3 p-3 h-100" aria-busy={previewLoading}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <i className="fa-regular fa-image text-primary" aria-hidden="true"></i>
                    <h6 className="mb-0">Upload or paste</h6>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Choose a file</label>
                    <input
                      type="file"
                      className="form-control"
                      accept="image/png,image/jpeg"
                      onChange={handleFileChange}
                      disabled={inputsDisabled}
                    />
                    <div className="form-text">PNG or JPEG images only. You can also paste an image.</div>
                  </div>
                  <div
                    className={`border rounded-2 p-2 bg-light-subtle small text-muted${inputsDisabled ? " opacity-50" : ""}`}
                    tabIndex={inputsDisabled ? -1 : 0}
                    onPaste={handlePaste}
                    aria-disabled={inputsDisabled}
                  >
                    Paste an image here to update the preview.
                  </div>
                </div>
              </div>
              <div className="col-12 col-lg-6">
                <div className="border rounded-3 p-3 bg-light-subtle h-100">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <i className="fa-solid fa-wand-magic-sparkles text-primary" aria-hidden="true"></i>
                    <h6 className="mb-0">Generate an avatar</h6>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Gender</label>
                    <div className="btn-group w-100" role="group" aria-label="Gender">
                      <input
                        type="radio"
                        className="btn-check"
                        name="avatar-gender"
                        id="avatar-gender-male"
                        checked={gender === "male"}
                        onChange={() => setGender("male")}
                        disabled={inputsDisabled}
                      />
                      <label className="btn btn-outline-primary" htmlFor="avatar-gender-male">
                        Male
                      </label>
                      <input
                        type="radio"
                        className="btn-check"
                        name="avatar-gender"
                        id="avatar-gender-female"
                        checked={gender === "female"}
                        onChange={() => setGender("female")}
                        disabled={inputsDisabled}
                      />
                      <label className="btn btn-outline-primary" htmlFor="avatar-gender-female">
                        Female
                      </label>
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Age</label>
                    <input
                      type="number"
                      className="form-control"
                      min={18}
                      max={85}
                      value={Number.isNaN(age) ? "" : age}
                      onChange={(event) => {
                      const next = event.target.valueAsNumber;
                      setAge(Number.isNaN(next) ? Number.NaN : next);
                      }}
                      onBlur={(event) => {
                      const next = event.target.valueAsNumber;
                      if (Number.isNaN(next)) {
                        setAge(18);
                        return;
                      }
                      setAge(Math.min(85, Math.max(18, next)));
                      }}
                      disabled={inputsDisabled}
                    />
                    <div className="form-text">Enter an age between 18 and 85.</div>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Hair colour</label>
                    <select
                      className="form-select"
                      value={hairColor}
                      onChange={(event) => setHairColor(event.target.value as (typeof hairColorOptions)[number])}
                      disabled={inputsDisabled}
                    >
                      {hairColorOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Ethnicity / skin tone</label>
                    <select
                      className="form-select"
                      value={ethnicitySkin}
                      onChange={(event) => setEthnicitySkin(event.target.value as (typeof ethnicityOptions)[number])}
                      disabled={inputsDisabled}
                    >
                      {ethnicityOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary w-100"
                    onClick={handleGenerate}
                    disabled={inputsDisabled}
                  >
                    {isGenerating ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-wand-magic-sparkles me-1" aria-hidden="true"></i>
                        Generate preview
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
            {(previewUrl || previewLoading) && (
              <div className="text-center mt-4">
                <div className="position-relative d-inline-block">
                  {previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Avatar preview"
                      className="rounded-circle border"
                      style={{ width: 120, height: 120, objectFit: "cover", opacity: previewLoading ? 0.5 : 1 }}
                      onLoad={() => setPreviewLoading(false)}
                      onError={() => {
                        setPreviewLoading(false);
                        updateSelectedFile(null);
                        toast.error("Unable to load preview");
                      }}
                    />
                  )}
                  {previewLoading && (
                    <div className="position-absolute top-50 start-50 translate-middle">
                      <span className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true"></span>
                    </div>
                  )}
                </div>
                <div className="small text-muted mt-2">
                  {previewLoading ? "Preparing preview..." : "Preview"}
                </div>
              </div>
            )}
            {currentAvatarUrl && (
              <div className="mt-3 d-flex justify-content-center">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  onClick={handleRemove}
                  disabled={isBusy || previewLoading || isGenerating}
                >
                  <i className="fa-regular fa-trash-can me-1" aria-hidden="true"></i>
                  {busyAction === "remove" ? "Removing..." : "Remove avatar"}
                </button>
              </div>
            )}
          </div>
        )}
        confirmLabel="Save avatar"
        confirmVariant="primary"
        confirmIconClass="fa-solid fa-floppy-disk"
        confirmDisabled={!selectedFile || previewLoading || isGenerating}
        isBusy={isBusy}
        onCancel={handleClose}
        onConfirm={handleSave}
      />
    </>
  );
}
