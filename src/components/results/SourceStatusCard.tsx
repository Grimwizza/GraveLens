"use client";

/**
 * SourceStatusCard — honest reporting for research sources that could not be
 * searched inline. Distinguishes "the source is down / has no API access"
 * from "the source answered with no records", and hands the user a
 * pre-filled deep link so the research can still happen with one tap.
 *
 * Renders nothing when every source is ok/empty.
 */

import type { ResearchSourceStatus } from "@/types";

const SOURCE_LABELS: Record<string, string> = {
  newspapers: "Historic newspapers (Library of Congress)",
  wikitree: "WikiTree profiles",
  familySearchHints: "FamilySearch records",
  ssdi: "Social Security Death Index",
  immigration: "Immigration & passenger lists",
  historicalCensus: "U.S. Census records",
};

interface Props {
  sourceStatus?: Record<string, ResearchSourceStatus>;
}

export default function SourceStatusCard({ sourceStatus }: Props) {
  if (!sourceStatus) return null;

  const affected = Object.entries(sourceStatus).filter(
    ([, s]) => s.status === "failed" || s.status === "unavailable"
  );
  if (affected.length === 0) return null;

  return (
    <div
      className="rounded-2xl px-4 py-3 mb-1"
      style={{
        background: "rgba(201,168,76,0.05)",
        border: "1px solid rgba(201,168,76,0.15)",
      }}
    >
      <p className="text-xs font-medium mb-2" style={{ color: "var(--t-gold-400)" }}>
        Some record sources need a direct search
      </p>
      <ul className="space-y-2">
        {affected.map(([key, s]) => (
          <li key={key} className="flex items-start gap-2">
            <span className="text-stone-500 text-[0.72rem] mt-0.5 shrink-0" aria-hidden>
              {s.status === "failed" ? "⚠︎" : "↗"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-stone-300 text-[0.78rem] leading-snug">
                {SOURCE_LABELS[key] ?? key}
                <span className="text-stone-500">
                  {s.status === "failed"
                    ? " — didn't respond, try again later"
                    : " — no API access; search it directly"}
                </span>
              </p>
              {s.fallbackUrl && (
                <a
                  href={s.fallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.75rem] font-medium underline underline-offset-2"
                  style={{ color: "var(--t-gold-500)" }}
                >
                  Open pre-filled search
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
