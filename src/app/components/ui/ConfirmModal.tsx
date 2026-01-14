"use client";

import { useEffect, useId, type ReactNode } from "react";

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  body: ReactNode;
  dialogClassName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: string;
  confirmIconClass?: string;
  isBusy?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  isOpen,
  title,
  body,
  dialogClassName,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  confirmIconClass,
  isBusy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="modal fade show"
        style={{ display: "block" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
          <div className={`modal-dialog modal-dialog-centered${dialogClassName ? ` ${dialogClassName}` : ""}`}>
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id={titleId}>
                {title}
              </h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onCancel} />
            </div>
            <div className="modal-body" id={bodyId}>
              {body}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={isBusy}>
                {cancelLabel}
              </button>
              <button
                type="button"
                className={`btn btn-${confirmVariant}`}
                onClick={onConfirm}
                disabled={isBusy || confirmDisabled}
              >
                {confirmIconClass && <i className={`${confirmIconClass} me-1`} aria-hidden="true"></i>}
                {isBusy ? "Working..." : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onCancel} role="presentation" />
    </>
  );
}
