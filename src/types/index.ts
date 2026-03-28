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

export interface ResearchData {
  military?: MilitaryRecord[];
  militaryContext?: MilitaryContext;
  newspapers?: NewspaperArticle[];
  landRecords?: LandRecord[];
  naraRecords?: NaraRecord[];
  cemetery?: CemeteryInfo;
  historical?: HistoricalContext;
  narrative?: LifeNarrative;
  localHistory?: LocalHistoryContext;
  culturalContext?: CulturalContext;
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
