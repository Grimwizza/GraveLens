/**
 * Shared US state name → 2-letter abbreviation utility.
 * Nominatim returns full state names (e.g. "Minnesota"); many APIs require codes.
 */

export const STATE_ABBREV: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

/**
 * Converts a full state name or pre-abbreviated code to a 2-letter code.
 * Returns empty string if unrecognized.
 */
export function toStateCode(state: string): string {
  if (!state) return "";
  const trimmed = state.trim();
  if (/^[A-Z]{2}$/.test(trimmed.toUpperCase())) return trimmed.toUpperCase();
  return STATE_ABBREV[trimmed] ?? "";
}
