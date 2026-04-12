export interface PersonData {
  name: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthYear: number | null;
  deathDate: string;
  deathYear: number | null;
  ageAtDeath: number | null;
}

export interface ExtractedGraveData {
  name: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  birthYear: number | null;
  deathDate: string;
  deathYear: number | null;
  ageAtDeath: number | null;
  inscription: string;
  epitaph: string;
  symbols: string[];
  markerType: string;
  material: string;
  condition: string;
  confidence: "high" | "medium" | "low";
  source: "claude" | "tesseract";
  analysisModel?: string;
  /** Populated when the marker commemorates more than one person. */
  people?: PersonData[];
}

export interface GeoLocation {
  lat: number;
  lng: number;
  cemetery?: string;
  cemeteryWikipedia?: string;
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}

export interface MilitaryRecord {
  conflict: string;
  branch: string;
  rank: string;
  unit: string;
  source: string;
  sourceUrl?: string;
  details?: string;
}

export interface NewspaperArticle {
  title: string;
  date: string;
  newspaper: string;
  location: string;
  url: string;
  snippet: string;
}

export interface LandRecord {
  patentNumber: string;
  date: string;
  state: string;
  county: string;
  acres: number;
  documentUrl?: string;
  coordinates?: { lat: number; lng: number };
}

export interface NaraRecord {
  title: string;
  recordGroup: string;
  description: string;
  url: string;
  thumbnailUrl?: string;
}

export interface CemeteryInfo {
  name: string;
  established?: string;
  denominiation?: string;
  description?: string;
  wikipediaUrl?: string;
  location?: GeoLocation;
}

export interface LifetimeLandmark {
  year: number;
  age: number;
  event: string;
}

export interface HistoricalContext {
  birthEra?: string;
  deathEra?: string;
  lifeExpectancyAtDeath?: number;
  birthYearEvents?: string[];       // real events from birth year
  deathYearEvents?: string[];       // real events from death year
  lifetimeLandmarks?: LifetimeLandmark[]; // major events they lived through
}

export interface MilitaryContext {
  likelyConflict?: string;      // e.g. "World War I"
  servedDuring?: string;        // e.g. "1917–1918"
  theater?: string;             // e.g. "Western Front, France"
  role?: string;                // e.g. "Tank Commander"
  roleDescription?: string;     // factual historical context for that role
  historicalNote?: string;      // broader service-era context
  inferredFrom?: "inscription" | "symbols" | "dates";
}

export interface LifeNarrative {
  narrative: string;
  epitaphSource?: string;
  epitaphMeaning?: string;
}

// ── Local / geographic history ────────────────────────────────────────────────

export interface WikipediaArticle {
  title: string;
  summary: string;
  url: string;
}

export interface DecadeSnapshot {
  label: string;   // e.g. "1880s in Wisconsin"
  events: string[];
}

export interface NrhpSite {
  name: string;
  address?: string;
  description?: string;
  wikidataId?: string;
  wikidataUrl?: string;
}

export interface CensusEntry {
  year: number;
  population: number;
  countyName?: string;
}

export interface WikidataEvent {
  label: string;
  year: number;
  description?: string;
  wikidataId?: string;
}

export interface NotableFigure {
  id: string;
  label: string;
  lat: number;
  lng: number;
  occupationId?: string;
  occupationLabel?: string;
  wikipediaUrl?: string;
  category: "political" | "military" | "artist" | "musician" | "actor" | "other";
}

export interface LocalHistoryContext {
  cityArticle?: WikipediaArticle;
  countyArticle?: WikipediaArticle;
  decadeSnapshots?: DecadeSnapshot[];
  localNewspaper?: NewspaperArticle[];
  nrhpSites?: NrhpSite[];
  censusPopulation?: CensusEntry[];
  sanbornMapUrl?: string;
  wikidataEvents?: WikidataEvent[];
}

export interface CulturalCategory {
  id: string;
  summary: string;
  detail?: string; // loaded on demand via "Tell me more"
}

export interface CulturalContext {
  categories: CulturalCategory[];
}

// ── FamilySearch hints ────────────────────────────────────────────────────────

export interface FamilySearchHint {
  /** Human-readable collection or record title */
  title: string;
  /** Collection date range, e.g. "1880–1940" */
  dateRange?: string;
  /** Record type label, e.g. "Death", "Census", "Military" */
  recordType?: string;
  /** Direct link to the record or collection search on FamilySearch */
  url: string;
  /** Whether the date range aligns with the person's known dates */
  dateConfident: boolean;
}

// ── SSDI ─────────────────────────────────────────────────────────────────────

export interface SSDIRecord {
  name: string;
  birthDate?: string;
  deathDate?: string;
  lastResidenceState?: string;
  matchConfidence: "high" | "medium" | "low";
  url: string;
}

// ── Immigration ──────────────────────────────────────────────────────────────

export interface ImmigrationRecord {
  collection: string;
  name: string;
  arrivalYear?: string;
  arrivalDate?: string;
  departurePort?: string;
  arrivalPort?: string;
  ageAtArrival?: string;
  origin?: string;
  url: string;
}

// ── Historical Census ───────────────────────────────────────────────────────

export interface CensusHouseholdMember {
  name: string;
  relationship?: string;
  age?: string;
  birthplace?: string;
}

export interface HistoricalCensusRecord {
  year: number;
  name: string;
  state?: string;
  county?: string;
  occupation?: string;
  birthplace?: string;
  fatherBirthplace?: string;
  motherBirthplace?: string;
  household?: CensusHouseholdMember[];
  url: string;
}

// ── Research checklist ────────────────────────────────────────────────────────

export interface ResearchChecklistItem {
  priority: 1 | 2 | 3;  // 1 = do first, 3 = nice to have
  action: string;        // Human-readable next step
  source: string;        // Record type / institution
  url?: string;          // Optional deep link
}

export interface ResearchChecklist {
  items: ResearchChecklistItem[];
}

export interface ResearchData {
  military?: MilitaryRecord[];
  militaryContext?: MilitaryContext;
  newspapers?: NewspaperArticle[];
  landRecords?: LandRecord[];
  naraRecords?: NaraRecord[];
  cemetery?: CemeteryInfo;
  historical?: HistoricalContext;
  /** Single-person narrative (legacy / single-person entries). */
  narrative?: LifeNarrative;
  /** Per-person narratives, parallel to extracted.people[]. Multi-person entries only. */
  narratives?: LifeNarrative[];
  localHistory?: LocalHistoryContext;
  culturalContext?: CulturalContext;
  /** FamilySearch public record collection hints */
  familySearchHints?: FamilySearchHint[];
  /** Social Security Death Index matches (1936–2014) */
  ssdi?: SSDIRecord[];
  /** Immigration & passenger record hits */
  immigration?: ImmigrationRecord[];
  /** Historical U.S. Census records (1880–1940) */
  historicalCensus?: HistoricalCensusRecord[];
  /** Deterministic next-step checklist derived from all research results */
  researchChecklist?: ResearchChecklist;
}

export interface GraveRecord {
  id: string;
  timestamp: number;
  photoDataUrl: string;
  location: GeoLocation;
  extracted: ExtractedGraveData;
  research: ResearchData;
  tags?: string[];
  userNotes?: string;
  syncedAt?: number; // Unix ms — set after a successful cloud sync
  /** Whether this grave is shared with the community. Default false. */
  isPublic?: boolean;
  /** Optional note shown to community members on the map. */
  communityNote?: string;
}

// ── Community / social types ──────────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  username?: string;
  displayName?: string;
  showUsername: boolean;
  shareAllByDefault: boolean;
  explorerXp: number;
  explorerRank: number;
  graveCount: number;
  publicGraveCount: number;
  joinedAt: string; // ISO timestamptz
}

/** Relationship between two users */
export type RelationshipType = "friend_request" | "friend" | "blocked";

export interface UserRelationship {
  id: string;
  fromUserId: string;
  toUserId: string;
  type: RelationshipType;
  createdAt: string;
}

/**
 * A public grave record returned when fetching community or friend graves.
 * Contains only the data needed for map display — no full research payload.
 */
export interface CommunityGraveRecord {
  id: string;
  lat: number;
  lng: number;
  name: string;
  birthDate?: string;
  deathDate?: string;
  cemetery?: string;
  photoUrl: string;
  communityNote?: string;
  /** Who this belongs to — "friend" = confirmed friend, "community" = everyone else */
  tier: "friend" | "community";
  /** Resolved display name for the contributor */
  contributorLabel: string;
  /** Explorer rank level (1–10) for insignia display */
  contributorRank: number;
}

/**
 * One record per unique cemetery the user has visited.
 * Created/updated automatically when a grave scan is saved at a new cemetery.
 */
export interface CemeteryRecord {
  /** Stable key: OSM element ID (e.g. "way/123456") or SHA-1 of name+lat+lng */
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Raw OSM element id used for de-duplication */
  osmId?: string;
  /** OSM opening_hours string, e.g. "Mo-Su 08:00-20:00" */
  openingHours?: string;
  phone?: string;
  website?: string;
  wikipediaUrl?: string;
  /** Estimated or documented founding year/era ("1842", "circa 1880s") */
  established?: string;
  denomination?: string;
  /** Short Wikipedia / AI-derived description of the cemetery */
  description?: string;
  /** Bullet-style notable features ("Victorian cast-iron fence", "War memorial section") */
  notableFeatures?: string[];
  /** Historical events tied to this site */
  historicalEvents?: string[];
  // ── Visit tracking ────────────────────────────────────────────────────────
  visitCount: number;
  firstVisited: number; // Unix ms
  lastVisited: number;  // Unix ms
}

export interface AnalysisResult {
  extracted: ExtractedGraveData;
  location: GeoLocation | null;
  photoDataUrl: string;
}

export interface QueuedCapture {
  id: string;
  timestamp: number;
  photoDataUrl: string;   // resized for storage (1200 px JPEG)
  location?: GeoLocation;
  sessionId?: string;
  sessionName?: string;
  status: "pending" | "failed";
  retries: number;
}
