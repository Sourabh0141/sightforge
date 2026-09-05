/**
 * SightForge Danger Zone Confirmation Modal (P4 U5, R105, R111)
 *
 * Enforces explicit verification with real asset count breakdown and a required
 * "delete" keyword entry gate before executing destructive cascade deletions.
 */

"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button, AlertCircleIcon, XIcon } from "@sightforge/ui";

export interface DangerZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: string;
  itemsToDelete: { label: string; count: number }[];
  confirmButtonLabel: string;
}

export const DangerZoneModal: React.FC<DangerZoneModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemsToDelete,
  confirmButtonLabel,
}) => {
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setConfirmationInput("");
      setError(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmed = confirmationInput.trim().toLowerCase() === "delete";

  const handleConfirm = async () => {
    if (!isConfirmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0C10]/80 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="danger-modal-title"
    >
      <div className="bg-[#12151C] border border-[#F87171]/40 rounded-[8px] max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 text-[#F87171]">
            <AlertCircleIcon size={20} />
            <h3
              id="danger-modal-title"
              className="text-base font-semibold text-[#E8EAED]"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-[#9AA3B2] hover:text-[#E8EAED] rounded-[4px]"
          >
            <XIcon size={16} />
          </button>
        </div>

        {/* Description */}
        <p className="text-xs text-[#9AA3B2] leading-relaxed">{description}</p>

        {/* Breakdown of what will be permanently removed */}
        <div className="p-3 bg-[#1A1F29] border border-[#252B37] rounded-[6px] space-y-1.5 text-xs font-mono">
          <span className="text-[11px] text-[#6B7280] uppercase block font-sans font-semibold">
            Permanently removing:
          </span>
          <ul className="space-y-1 text-[#E8EAED]">
            {itemsToDelete.map((item, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <span>{item.label}</span>
                <span className="text-[#22D3EE] font-semibold">
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Verification Input */}
        <div className="space-y-2">
          <label
            htmlFor="delete-confirm-input"
            className="text-xs text-[#E8EAED] block font-medium"
          >
            To confirm, type{" "}
            <span className="font-mono text-[#F87171] font-semibold">
              delete
            </span>{" "}
            below:
          </label>
          <input
            id="delete-confirm-input"
            ref={inputRef}
            type="text"
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isConfirmed) {
                void handleConfirm();
              }
            }}
            placeholder="delete"
            disabled={isSubmitting}
            className="w-full bg-[#0A0C10] border border-[#252B37] focus:border-[#F87171] text-[#E8EAED] font-mono text-xs rounded-[6px] px-3 py-2 outline-none focus:ring-1 focus:ring-[#F87171]"
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="text-xs text-[#F87171] p-2 bg-[#F87171]/10 rounded border border-[#F87171]/20">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            disabled={!isConfirmed || isSubmitting}
          >
            {isSubmitting ? "Deleting…" : confirmButtonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
