// Bump whenever the research pipeline gains/removes a source or changes its
// output shape — this invalidates the shared research cache (grave_identity_index)
// and triggers ArchivePage background re-enrichment of legacy records.
//   v2: identity layer, source status, loc.gov migration
//   v3: WikiTree inline source added
export const CURRENT_RESEARCH_VERSION = 3;
