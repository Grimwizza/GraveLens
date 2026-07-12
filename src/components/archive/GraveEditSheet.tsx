"use client";

/**
 * GraveEditSheet — full record editing straight from an archive row.
 *
 * Replaces the old cemetery-only inline editor: name, birth date, death
 * date, and cemetery are all correctable without opening the record and
 * hunting for pencil icons (audit finding F6).
 *
 * Only changed fields are passed to onSave; the caller derives
 * firstName/lastName and year numbers the same way ResultPage edits do.
 */

import { useState } from "react";
import type { GraveRecord } from "@/types";

export interface GraveEditPatch {
  name?: string;
  birthDate?: string;
  deathDate?: string;
  cemetery?: string;
}

export default function GraveEditSheet({
  grave,
  onSave,
  onClose,
}: {
  grave: GraveRecord;
  onSave: (patch: GraveEditPatch) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(grave.extracted.name ?? "");
  const [birthDate, setBirthDate] = useState(grave.extracted.birthDate ?? "");
  const [deathDate, setDeathDate] = useState(grave.extracted.deathDate ?? "");
  const [cemetery, setCemetery] = useState(grave.location?.cemetery ?? "");
  const [saving, setSaving] = useState(false);

  const buildPatch = (): GraveEditPatch => {
    const patch: GraveEditPatch = {};
    if (name.trim() !== (grave.extracted.name ?? "")) patch.name = name.trim();
    if (birthDate.trim() !== (grave.extracted.birthDate ?? "")) patch.birthDate = birthDate.trim();
    if (deathDate.trim() !== (grave.extracted.deathDate ?? "")) patch.deathDate = deathDate.trim();
    if (cemetery.trim() !== (grave.location?.cemetery ?? "")) patch.cemetery = cemetery.trim();
    return patch;
  };

  const handleSave = async () => {
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true);
    try {
      await onSave(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder: string
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-stone-500 uppercase tracking-widest">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="bg-stone-700/60 text-stone-100 text-sm rounded-xl px-3 py-2.5 border border-stone-600 focus:outline-none focus:border-stone-400"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center lg:p-6">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-sm mx-auto bg-stone-800 rounded-t-3xl lg:rounded-2xl animate-fade-up"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-stone-600 rounded-full mx-auto mt-3 mb-4" />

        <div className="px-6">
          <h3 className="font-serif text-stone-100 text-lg mb-4">
            Edit {grave.extracted.name || "this marker"}
          </h3>

          <div className="flex flex-col gap-3 mb-5">
            {field("Name", name, setName, "Full name as inscribed")}
            <div className="grid grid-cols-2 gap-3">
              {field("Born", birthDate, setBirthDate, "e.g. June 2, 1861")}
              {field("Died", deathDate, setDeathDate, "e.g. Feb 3, 1922")}
            </div>
            {field("Cemetery", cemetery, setCemetery, "Cemetery name")}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 rounded-xl font-semibold text-[#1a1917] text-sm transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--t-gold-500), var(--t-gold-400))" }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 h-12 rounded-xl text-sm text-stone-400 bg-stone-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
