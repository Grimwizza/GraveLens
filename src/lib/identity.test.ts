import { describe, it, expect } from "vitest";
import { computePersonIdentityKey } from "./community";
import { shouldReview } from "./reviewUtils";
import { buildUsGenWebLinks } from "./researchLinks";
import type { GraveRecord, ExtractedGraveData } from "@/types";

describe("computePersonIdentityKey", () => {
  it("should return a stable identity string for valid data", () => {
    const key = computePersonIdentityKey({
      givenName: "John",
      surname: "Smith",
      birthYear: 1880,
      deathYear: 1950,
      state: "CA",
    });
    expect(key).toBe("john|smith|1880|1950|ca");
  });

  it("should return null if surname is missing", () => {
    const key = computePersonIdentityKey({
      givenName: "John",
      birthYear: 1880,
      deathYear: 1950,
    });
    expect(key).toBeNull();
  });

  it("should return null if both birthYear and deathYear are missing", () => {
    const key = computePersonIdentityKey({
      givenName: "John",
      surname: "Smith",
      state: "CA",
    });
    expect(key).toBeNull();
  });

  it("should handle missing givenName and state gracefully", () => {
    const key = computePersonIdentityKey({
      surname: "Smith",
      birthYear: 1880,
    });
    expect(key).toBe("|smith|1880||");
  });
});

describe("shouldReview", () => {
  const defaultExtracted = (): ExtractedGraveData => ({
    name: "John Smith",
    firstName: "John",
    lastName: "Smith",
    birthDate: "1880-01-01",
    birthYear: 1880,
    deathDate: "1950-01-01",
    deathYear: 1950,
    ageAtDeath: 70,
    inscription: "In Loving Memory",
    epitaph: "",
    symbols: [],
    markerType: "Headstone",
    material: "Granite",
    condition: "Good",
    confidence: "high",
    source: "claude",
  });

  const baseRecord = (): GraveRecord => ({
    id: "test-id",
    timestamp: Date.now(),
    photoDataUrl: "data:image/png;base64,abc",
    needsReview: false,
    extracted: defaultExtracted(),
    location: {
      lat: 0,
      lng: 0,
    },
    research: {},
  });

  it("should return false for high confidence, anchored names/dates", () => {
    const record = baseRecord();
    expect(shouldReview(record)).toBe(false);
  });

  it("should return false if already reviewed", () => {
    const record = baseRecord();
    record.needsReview = true;
    record.reviewedAt = Date.now();
    expect(shouldReview(record)).toBe(false);
  });

  it("should return true if needsReview is explicitly true", () => {
    const record = baseRecord();
    record.needsReview = true;
    expect(shouldReview(record)).toBe(true);
  });

  it("should return true if confidence is low", () => {
    const record = baseRecord();
    record.extracted.confidence = "low";
    expect(shouldReview(record)).toBe(true);
  });

  it("should return true if both birthYear and deathYear are missing", () => {
    const record = baseRecord();
    record.extracted.birthYear = null;
    record.extracted.deathYear = null;
    expect(shouldReview(record)).toBe(true);
  });

  it("should return true if name has unusual characters", () => {
    const record = baseRecord();
    record.extracted.name = "John Smith #1";
    expect(shouldReview(record)).toBe(true);
  });
});

describe("buildUsGenWebLinks", () => {
  it("should return pre-filled Google search and county directory links when county is provided", () => {
    const links = buildUsGenWebLinks({
      firstName: "John",
      lastName: "Smith",
      state: "California",
      county: "Sonoma County",
    });

    expect(links).toHaveLength(2);
    expect(links[0].category).toBe("usgenweb");
    expect(links[0].url).toContain("site%3Ausgwarchives.net");
    expect(links[0].url).toContain("%22Smith%22");
    expect(links[0].url).toContain("sonoma%20ca");

    expect(links[1].category).toBe("usgenweb");
    expect(links[1].url).toBe("http://files.usgwarchives.net/ca/sonoma/");
  });

  it("should return only Google search link if county is missing", () => {
    const links = buildUsGenWebLinks({
      firstName: "John",
      lastName: "Smith",
      state: "California",
    });

    expect(links).toHaveLength(1);
    expect(links[0].category).toBe("usgenweb");
    expect(links[0].url).toContain("site%3Ausgwarchives.net");
    expect(links[0].url).not.toContain("sonoma");
  });

  it("should return empty array if lastName is missing", () => {
    const links = buildUsGenWebLinks({
      firstName: "John",
      lastName: "",
      state: "California",
    });
    expect(links).toEqual([]);
  });
});

