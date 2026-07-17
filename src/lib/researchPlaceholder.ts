/**
 * Placeholder artwork for research-only archive records (no photo scanned).
 * Stored directly as the record's photoDataUrl/thumbnailDataUrl — cloudSync's
 * uploadPhoto passes SVG data URLs through untouched.
 */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="#1c1917"/><path d="M48 20c-9.4 0-17 7.6-17 17v33h34V37c0-9.4-7.6-17-17-17z" fill="#292524" stroke="#57534e" stroke-width="2"/><line x1="40" y1="44" x2="56" y2="44" stroke="#57534e" stroke-width="2" stroke-linecap="round"/><line x1="40" y1="52" x2="56" y2="52" stroke="#57534e" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="62" r="13" fill="#1c1917" fill-opacity="0.6" stroke="#c9a84c" stroke-width="3"/><line x1="69" y1="71" x2="79" y2="81" stroke="#c9a84c" stroke-width="4" stroke-linecap="round"/></svg>`;

export const RESEARCH_PLACEHOLDER_IMAGE =
  "data:image/svg+xml," + encodeURIComponent(SVG);
