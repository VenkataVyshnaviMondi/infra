import { expect, it } from "vitest";
import { pricePerSqft } from "../src/lib/property-price";
it("derives plot and flat rates from the correct area and recalculates on changes", () => {
  expect(pricePerSqft("plots", "4500000", { plotArea: "1800" })).toBe(2500);
  expect(pricePerSqft("plots", 5400000, { plotArea: 1800 })).toBe(3000);
  expect(pricePerSqft("plots", 5400000, { plotArea: 2700 })).toBe(2000);
  expect(
    pricePerSqft("flats", 6000000, { superArea: 1500, plotArea: 1000 }),
  ).toBe(4000);
  expect(pricePerSqft("flats", 30000, { superArea: 1500 })).toBe(20);
});
it("does not display a rate for invalid or missing prices/areas or other categories", () => {
  for (const value of [undefined, "", 0, -1, Infinity, "invalid"])
    expect(pricePerSqft("plots", 100, { plotArea: value })).toBeNull();
  expect(pricePerSqft("flats", "", { superArea: 100 })).toBeNull();
  expect(pricePerSqft("furniture", 100, { superArea: 100 })).toBeNull();
  expect(pricePerSqft("plots", 100)).toBeNull();
});
