import { describe, it, expect } from "vitest";
import { validateExtraction, looksMultiPerson } from "./extractionValidation";

describe("validateExtraction", () => {
  it("passes a plausible single-person extraction", () => {
    expect(
      validateExtraction({ name: "William Larson", birthYear: 1861, deathYear: 1922, ageAtDeath: 61 })
    ).toEqual([]);
  });

  it("flags death year before birth year", () => {
    const issues = validateExtraction({ name: "X", birthYear: 1900, deathYear: 1850 });
    expect(issues).toHaveLength(1);
    expect(issues[0].problem).toMatch(/before birth/);
  });

  it("flags an out-of-range year (OCR confusable, e.g. 1861 → 1361)", () => {
    const issues = validateExtraction({ name: "X", birthYear: 1361, deathYear: 1922 });
    expect(issues.some((i) => /birthYear .*outside/.test(i.problem))).toBe(true);
  });

  it("flags an implausible age", () => {
    const issues = validateExtraction({ name: "X", ageAtDeath: 250 });
    expect(issues.some((i) => /ageAtDeath/.test(i.problem))).toBe(true);
  });

  it("flags age that disagrees with the year span by more than 2", () => {
    const issues = validateExtraction({ name: "X", birthYear: 1861, deathYear: 1922, ageAtDeath: 30 });
    expect(issues.some((i) => /disagrees/.test(i.problem))).toBe(true);
  });

  it("tolerates a 1-2 year age rounding difference", () => {
    expect(
      validateExtraction({ name: "X", birthYear: 1861, deathYear: 1922, ageAtDeath: 60 })
    ).toEqual([]);
  });

  it("validates each person in people[] and labels by name", () => {
    const issues = validateExtraction({
      name: "William Larson",
      birthYear: 1861,
      deathYear: 1922,
      people: [
        { name: "William Larson", birthYear: 1861, deathYear: 1922 },
        { name: "Emma Larson", birthYear: 1940, deathYear: 1865 }, // swapped
      ],
    });
    expect(issues.some((i) => i.person === "Emma Larson")).toBe(true);
  });

  it("ignores null/absent values", () => {
    expect(validateExtraction({ name: "X", birthYear: null, deathYear: null, ageAtDeath: null })).toEqual([]);
  });
});

describe("looksMultiPerson", () => {
  it("detects two or more year ranges", () => {
    expect(looksMultiPerson("JOHN 1861–1922 MARY 1865–1940")).toBe(true);
  });

  it("detects shared-stone relationship labels", () => {
    expect(looksMultiPerson("FATHER 1861 his wife MARY")).toBe(true);
  });

  it("returns false for a single person", () => {
    expect(looksMultiPerson("WILLIAM LARSON 1861–1922")).toBe(false);
  });

  it("returns false for empty inscription", () => {
    expect(looksMultiPerson("")).toBe(false);
  });
});
