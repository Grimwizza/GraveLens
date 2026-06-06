"use client";

import { useEffect, useRef, useState } from "react";
import PageShell from "@/components/layout/PageShell";
import {
  QUEUE_CHANGED_EVENT,
  retryQueueItem,
  retryAllFailedItems,
  deleteQueueItem,
  getActiveItemId,
} from "@/lib/queue";
import { getQueuedItems } from "@/lib/storage";
import type { QueuedCapture } from "@/types";

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function QueuePage() {
  const [items, setItems] = useState<QueuedCapture[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sessionTotal, setSessionTotal] = useState<number>(0);
  const sessionTotalRef = useRef<number>(0);

  const refresh = async () => {
    const all = await getQueuedItems();
    setItems(all);
    setActiveId(getActiveItemId());

    const nonEmpty = all.length > 0;
    if (nonEmpty && sessionTotalRef.current === 0) {
      sessionTotalRef.current = all.length;
      setSessionTotal(all.length);
    } else if (!nonEmpty) {
      sessionTotalRef.current = 0;
      setSessionTotal(0);
    } else {
      setSessionTotal(Math.max(sessionTotalRef.current, all.length));
    }
  };

  useEffect(() => {
    setTimeout(() => {
      refresh();
    }, 0);
    const handler = () => refresh();
    window.addEventListener(QUEUE_CHANGED_EVENT, handler);
    // Poll activeItemId at a higher cadence since it's in-memory only
    const poll = setInterval(() => setActiveId(getActiveItemId()), 800);
    return () => {
      window.removeEventListener(QUEUE_CHANGED_EVENT, handler);
      clearInterval(poll);
    };
  }, []);

  const pending = items.filter((i) => i.status === "pending");
  const failed = items.filter((i) => i.status === "failed");
  const total = Math.max(sessionTotal, items.length);
  const processed = Math.max(0, total - items.length);
  const progressPct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const isProcessing = activeId !== null;
  const allDone = items.length === 0 && total > 0;

  return (
    <PageShell title="Scan Queue">
      <div className="flex flex-col gap-6 px-4 pt-4 pb-28 max-w-lg mx-auto w-full">

        {/* Progress section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-400">
              {allDone
                ? "All scans complete"
                : total > 0
                ? `${processed} of ${total} processed`
                : `${items.length} item${items.length !== 1 ? "s" : ""} queued`}
            </span>
            {total > 0 && !allDone && (
              <span className="text-stone-500 tabular-nums">{progressPct}%</span>
            )}
          </div>

          <div className="relative h-2 rounded-full overflow-hidden bg-stone-800">
            {allDone ? (
              <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg, #c9a84c 0%, #a07830 100%)" }} />
            ) : isProcessing ? (
              // Indeterminate shimmer while actively processing
              <div
                className="absolute inset-y-0 w-1/3 rounded-full animate-[shimmer_1.4s_ease-in-out_infinite]"
                style={{ background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.6), transparent)" }}
              />
            ) : total > 0 ? (
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, #57534e 0%, #c9a84c 100%)",
                }}
              />
            ) : null}
          </div>
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)" }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--t-gold-500)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-stone-200 font-medium text-base">All caught up</p>
              <p className="text-stone-500 text-sm mt-1">No images waiting to be processed</p>
            </div>
          </div>
        )}

        {/* Pending / active items */}
        {pending.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-500 px-1">
              Pending · {pending.length}
            </h2>
            <div className="flex flex-col gap-2">
              {pending.map((item) => {
                const isActive = item.id === activeId;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl p-3 transition-all"
                    style={{
                      background: isActive
                        ? "rgba(201,168,76,0.08)"
                        : "rgba(255,255,255,0.03)",
                      border: isActive
                        ? "1px solid rgba(201,168,76,0.35)"
                        : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-stone-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.photoDataUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      {isActive && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div
                            className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                            style={{ borderColor: "var(--t-gold-500) transparent transparent transparent" }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-stone-200 text-sm font-medium truncate">
                        {item.sessionName ?? "Offline Capture"}
                      </span>
                      <span className="text-stone-500 text-xs">
                        {isActive ? (
                          <span style={{ color: "var(--t-gold-500)" }}>Analyzing…</span>
                        ) : (
                          timeAgo(item.timestamp)
                        )}
                      </span>
                    </div>

                    {isActive && (
                      <div
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(201,168,76,0.15)", color: "var(--t-gold-500)" }}
                      >
                        Processing
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Failed items */}
        {failed.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold tracking-wider uppercase text-stone-500 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Failed · {failed.length}
              </h2>
              <button
                onClick={() => retryAllFailedItems()}
                className="text-xs text-stone-400 hover:text-stone-200 transition-colors py-1"
              >
                Retry all
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {failed.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl p-3"
                  style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}
                >
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-stone-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.photoDataUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="text-stone-200 text-sm font-medium truncate">
                      {item.sessionName ?? "Offline Capture"}
                    </span>
                    <span className="text-stone-500 text-xs">
                      Failed after {item.retries} attempt{item.retries !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => retryQueueItem(item.id)}
                      className="p-2 rounded-xl text-stone-400 hover:text-stone-200 transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                      aria-label="Retry"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteQueueItem(item.id)}
                      className="p-2 rounded-xl text-stone-600 hover:text-red-400 transition-colors"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                      aria-label="Delete"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
