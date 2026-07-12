import { describe, it, expect } from "vitest";
import { surnameFromId, stateFromPlace, cleanDate, yearOf } from "./wikitree";

describe("surnameFromId", () => {
  it("strips the trailing number", () => {
    expect(surnameFromId("Larson-6533")).toBe("Larson");
    expect(surnameFromId("Lincoln-103")).toBe("Lincoln");
  });
  it("converts underscores in compound surnames to spaces", () => {
    expect(surnameFromId("Van_Buren-1")).toBe("Van Buren");
  });
});

describe("stateFromPlace", () => {
  it("returns the state before 'United States'", () => {
    expect(stateFromPlace("Warren, Marshall, Minnesota, United States")).toBe("Minnesota");
    expect(stateFromPlace("South Dakota, United States")).toBe("South Dakota");
  });
  it("returns a foreign region when there is no US suffix", () => {
    expect(stateFromPlace("Danmark")).toBe("Danmark");
  });
  it("returns undefined for empty input", () => {
    expect(stateFromPlace(undefined)).toBeUndefined();
    expect(stateFromPlace("")).toBeUndefined();
  });
});

describe("cleanDate / yearOf", () => {
  it("treats WikiTree's 0000 sentinel as unknown", () => {
    expect(cleanDate("0000-00-00")).toBeUndefined();
    expect(yearOf("0000-00-00")).toBeNull();
  });
  it("extracts a real year", () => {
    expect(cleanDate("1861-01-26")).toBe("1861-01-26");
    expect(yearOf("1861-01-26")).toBe(1861);
  });
  it("handles missing input", () => {
    expect(yearOf(undefined)).toBeNull();
  });
});
