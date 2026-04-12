/**
 * researchChecklist.ts
 * Deterministic "What to Research Next" engine.
 *
 * Evaluates the complete research payload and produces a prioritized list of
 * actionable next steps. Pure rule-based logic — zero API calls, zero AI cost.
 *
 * Priority scale:
 *   1 = Do this first — most likely to break a brick wall
 *   2 = High value — worthwhile once Priority 1 steps are done
 *   3 = Supplementary — useful for corroboration or filling gaps
 */

import type {
  ResearchData,
  ExtractedGraveData,
  GeoLocation,
  ResearchChecklist,
  ResearchChecklistItem,
} from "@/types";

// ── Helper predicates ─────────────────────────────────────────────────────────

function hasCoords(loc: GeoLocation | null | undefined): boolean {
  return !!loc && (loc.lat !== 0 || loc.lng !== 0);
}

function isLikelyImmigrant(
  extracted: ExtractedGraveData,
  research: ResearchData,
  location: GeoLocation | null | undefined
): boolean {
  const inscription = extracted.inscription?.toLowerCase() ?? "";
  // Non-English text present
  if (/[àáâãäåæèéêëìíîïòóôõöùúûüýÿñçßøœ]/i.test(inscription)) return true;
  // Cemetery denomination suggests non-Anglo community
  const denom = (research.cemetery as unknown as { denomination?: string })?.denomination?.toLowerCase() ?? "";
  if (/lutheran|catholic|jewish|orthodox|evangelical/i.test(denom)) return true;
  // Location says country other than US
  if (location?.country && location.country !== "United States") return true;
  return false;
}

function stateLabel(state: string | undefined, fallback = "appropriate state"): string {
  return state || fallback;
}

// ── Rules engine ──────────────────────────────────────────────────────────────

export function buildResearchChecklist(
  extracted: ExtractedGraveData,
  research: ResearchData,
  location: GeoLocation | null | undefined
): ResearchChecklist {
  const items: ResearchChecklistItem[] = [];

  const { birthYear, deathYear, name, firstName, lastName } = extracted;
  const state = location?.state;
  const county = location?.county;
  const city = location?.city;
  const isMilitary = !!(research.militaryContext);
  const hasNara = (research.naraRecords?.length ?? 0) > 0;
  const hasLand = (research.landRecords?.length ?? 0) > 0;
  const hasNewspaper = (research.newspapers?.length ?? 0) > 0;
  const hasFs = (research.familySearchHints?.length ?? 0) > 0;
  const conflict = research.militaryContext?.likelyConflict;
  const immigrant = isLikelyImmigrant(extracted, research, location);

  // ── Priority 1: Core identity confirmation ──────────────────────────────────

  // SSDI — fastest identity confirmation for post-1936 deaths
  if (deathYear && deathYear >= 1936 && deathYear <= 2014) {
    items.push({
      priority: 1,
      action: `Search the Social Security Death Index for ${name || "this person"} — verifies death date, last known state, and SSN for downstream record requests.`,
      source: "Social Security Death Index (SSDI)",
      url: `https://www.familysearch.org/search/record/results?q.surname=${encodeURIComponent(lastName ?? "")}&q.givenName=${encodeURIComponent(firstName ?? "")}&q.deathLikeDate.from=${deathYear - 1}&q.deathLikeDate.to=${deathYear + 1}&f.collectionId=2437639`,
    });
  }

  // FamilySearch — if no hints returned yet, prompt manual search
  if (!hasFs && lastName) {
    items.push({
      priority: 1,
      action: `Search FamilySearch for ${name || "this person"} — 9 billion free indexed records including census, vital records, and military files.`,
      source: "FamilySearch Records",
      url: `https://www.familysearch.org/search/record/results?q.surname=${encodeURIComponent(lastName)}&q.givenName=${encodeURIComponent(firstName ?? "")}${birthYear ? `&q.birthLikeDate.from=${birthYear - 2}&q.birthLikeDate.to=${birthYear + 2}` : ""}`,
    });
  }

  // Historical census — if person lived before 1940
  if (birthYear && birthYear < 1935) {
    const censusSets: Array<{ year: number; fsCollectionId: string }> = [
      { year: 1940, fsCollectionId: "2000219" },
      { year: 1930, fsCollectionId: "1452222" },
      { year: 1920, fsCollectionId: "1488411" },
      { year: 1910, fsCollectionId: "1727033" },
      { year: 1900, fsCollectionId: "1325221" },
      { year: 1880, fsCollectionId: "1417683" },
    ];
    const applicable = censusSets.filter((c) => {
      const personAge = c.year - (birthYear ?? 0);
      return personAge >= 0 && personAge <= 110;
    });
    if (applicable.length > 0) {
      const best = applicable[0];
      items.push({
        priority: 1,
        action: `Find ${name || "this person"} in the ${best.year} U.S. Federal Census — provides household composition, occupation, birthplace, and parents' birthplaces.`,
        source: `${best.year} U.S. Federal Census (FamilySearch)`,
        url: `https://www.familysearch.org/search/record/results?q.surname=${encodeURIComponent(lastName ?? "")}&q.givenName=${encodeURIComponent(firstName ?? "")}&f.collectionId=${best.fsCollectionId}`,
      });
    }
  }

  // ── Priority 1: Military-specific ──────────────────────────────────────────

  if (isMilitary) {
    // NARA pension file request — most valuable military document
    if (!hasNara || (research.naraRecords?.length ?? 0) < 2) {
      const rg = conflict === "Civil War" ? "RG 15 (Pension Files)" : "RG 94 or RG 407";
      items.push({
        priority: 1,
        action: `Request ${conflict ?? "military"} service or pension records from NARA (${rg}). Use NATF Form 86 for pension; NATF Form 85 for service records. Free for deaths before 1946; nominal fee for modern records.`,
        source: "National Archives (NARA)",
        url: "https://www.archives.gov/veterans/military-service-records",
      });
    }

    // Vietnam Wall check
    if (conflict === "Vietnam War") {
      items.push({
        priority: 1,
        action: `Search the Vietnam Veterans Memorial Wall for ${name || "this person"} — confirms KIA/MIA status and unit assignment.`,
        source: "Vietnam Veterans Memorial Fund",
        url: `https://www.vvmf.org/database/?name=${encodeURIComponent(name ?? "")}`,
      });
    }

    // WWII enlistment record
    if (conflict === "World War II") {
      items.push({
        priority: 1,
        action: `Search WWII Army Enlistment Records (NARA Access to Archival Databases) for ${name || "this person"} — free, searchable database of 9 million enlistments with rank, occupation, and birthplace.`,
        source: "NARA Access to Archival Databases (AAD)",
        url: `https://aad.archives.gov/aad/record-detail.jsp?dt=893&q=${encodeURIComponent(name ?? "")}`,
      });
    }
  }

  // ── Priority 2: Vital records and land ─────────────────────────────────────

  // State death certificate — for deaths with a known state
  if (deathYear && state) {
    const stateYear = deathYear >= 1900 ? deathYear : null;
    if (stateYear) {
      items.push({
        priority: 2,
        action: `Request ${name || "this person"}'s death certificate from the ${stateLabel(state)} State Archives or Health Department. Death certificates list cause of death, birthplace, parents' names, and attending physician — often the most data-rich single document in a file.`,
        source: `${stateLabel(state)} Vital Records`,
        url: `https://www.cdc.gov/nchs/w2w/index.htm`,
      });
    }
  }

  // Newspaper — if no results returned, suggest variant search
  if (!hasNewspaper && name) {
    items.push({
      priority: 2,
      action: `Search Chronicling America (Library of Congress) with surname variants — ${deathYear ? `focus the date window ${deathYear - 1}–${deathYear + 2}` : ""}. Try maiden name or phonetic spelling if the primary search returned nothing.`,
      source: "Chronicling America (Library of Congress)",
      url: `https://chroniclingamerica.loc.gov/search/pages/results/?proxtext=${encodeURIComponent(lastName ?? name)}&sort=relevance${state ? `&state=${encodeURIComponent(state)}` : ""}`,
    });
  }

  // Land → probate chain
  if (hasLand && deathYear && deathYear < 1950) {
    items.push({
      priority: 2,
      action: `Check the ${county ? county + " County" : stateLabel(state)} probate court for a will or estate record — land owners almost always left probate files that name all surviving heirs and their married names.`,
      source: `${county ? county + " County" : stateLabel(state)} Probate Court`,
      url: county && state
        ? `https://usgwarchives.net/${state.toLowerCase().replace(/\s/g, "")}/${county.toLowerCase().replace(/\s/g, "")}/`
        : "https://usgwarchives.net/",
    });
  }

  // ── Priority 2: Immigration ─────────────────────────────────────────────────

  if (immigrant && birthYear && birthYear > 1820) {
    const arrivalEst = birthYear + 25; // Typical immigration age heuristic
    items.push({
      priority: 2,
      action: `Search ${birthYear < 1892 ? "Castle Garden (pre-Ellis Island arrivals, 1820–1892)" : "Ellis Island passenger records (1892–1957)"} for ${name || "this person"} — ship manifests list exact European hometown, US contact, and occupation.`,
      source: birthYear < 1892 ? "Castle Garden" : "Ellis Island Foundation",
      url: birthYear < 1892
        ? `https://www.castlegarden.org/passenger_list.php?surname=${encodeURIComponent(lastName ?? "")}`
        : `https://heritage.statueofliberty.org/passenger?q=${encodeURIComponent(name ?? "")}&arrival_years=${arrivalEst - 10}-${arrivalEst + 20}`,
    });

    // Naturalization — NARA RG 85
    if (deathYear && deathYear > 1900) {
      items.push({
        priority: 2,
        action: `Search naturalization records (NARA RG 85) for ${name || "this person"} — declaration of intention ("first papers") and petition for naturalization both confirm country of origin and often list birthplace, arrival date, and spouse.`,
        source: "NARA RG 85 (Immigration and Naturalization Service)",
        url: `https://catalog.archives.gov/search?q=${encodeURIComponent((name ?? "") + " naturalization")}&f.recordGroupNumber=85`,
      });
    }
  }

  // ── Priority 3: Supplementary ───────────────────────────────────────────────

  // Sanborn maps — if city is known
  if (city && state && deathYear && deathYear < 1970) {
    items.push({
      priority: 3,
      action: `View Sanborn fire insurance maps for ${city}, ${state} — block-level building maps help confirm residential addresses from census records and locate the family's neighborhood.`,
      source: "Sanborn Maps (Library of Congress)",
      url: `https://www.loc.gov/collections/sanborn-maps/?q=${encodeURIComponent(city + " " + state)}`,
    });
  }

  // BLM GLO — if no land records but rural pre-1900
  if (!hasLand && birthYear && birthYear < 1890 && state) {
    items.push({
      priority: 3,
      action: `Search BLM General Land Office Records for land patents in ${stateLabel(state)} under this surname — homestead filings and cash entries confirm when and where the family settled.`,
      source: "BLM General Land Office Records",
      url: `https://glorecords.blm.gov/search/default.aspx#searchTabIndex=0&searchByType=NameSearch&lastName=${encodeURIComponent(lastName ?? "")}&firstName=${encodeURIComponent(firstName ?? "")}&state=${encodeURIComponent(state)}`,
    });
  }

  // USGenWeb county transcriptions
  if (county && state) {
    items.push({
      priority: 3,
      action: `Check USGenWeb Archives for ${county} County, ${stateLabel(state)} — volunteer-transcribed deed books, early census, and local history often not available anywhere else online.`,
      source: "USGenWeb Archives",
      url: `https://usgwarchives.net/${state.toLowerCase().replace(/\s/g, "")}/${county.toLowerCase().replace(/\s/g, "")}/`,
    });
  }

  // Sort: priority 1 → 2 → 3, stable
  items.sort((a, b) => a.priority - b.priority);

  return { items: items.slice(0, 10) }; // Cap at 10 so UI stays scannable
}
