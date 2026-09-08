import assert from "node:assert/strict";
import test from "node:test";
import { collectCurrentCeidgPkdCodes } from "../src/lib/ceidgPkd.ts";

test("uses current activities, not deregistered entries, raw history or PKD years", () => {
  const result = collectCurrentCeidgPkdCodes({
    companies: [
      { id: "old", status: "WYKRESLONY", pkd: [{ kod: "4120Z", nazwa: "Old activity" }] },
      { id: "current", status: "AKTYWNY", szczegoly: { firma: [{
        id: "current", status: "AKTYWNY", rokPkd: "2025",
        pkdGlowny: { kod: "8551Z", nazwa: "Current main" },
        pkd: [{ kod: "8551Z" }, { kod: "93.19.Z", nazwa: "Current extra" }],
        historia: { rokPkd: "2007", pkd: [{ kod: "4331Z" }] },
      }] } },
    ],
    data: { firmy: [{ status: "WYKRESLONY", pkd: [{ kod: "4311Z" }] }] },
  });
  assert.deepEqual(result.map((x) => x.kod), ["85.51.Z", "93.19.Z"]);
  assert.equal(result[0].przewazajace, true);
  assert.equal(result[0].nazwa, "Current main");
});

test("never falls back to a deregistered company when no current company exists", () => {
  assert.deepEqual(collectCurrentCeidgPkdCodes({ companies: [
    { status: "WYKRESLONY", pkdGlowny: "4120Z" },
    { status: "OCZEKUJE_NA_ROZPOCZECIE_DZIALALNOSCI", pkdGlowny: "4331Z" },
    { pkdGlowny: "4332Z" },
  ] }), []);
});

test("keeps suspended current businesses and merges main-code duplicates", () => {
  const result = collectCurrentCeidgPkdCodes({ companies: [{
    status: "ZAWIESZONY", rokPkd: "2007", pkdGlowny: "85.51.Z",
    pkd: [{ kod: "8551Z", nazwa: "Main description" }, { kod: "2007" }, { kod: "2025" }],
  }] });
  assert.deepEqual(result, [{ kod: "85.51.Z", nazwa: "Main description", przewazajace: true, zrodlo: "CEIDG" }]);
});

test("uses matching detailed status and does not read another company's details", () => {
  assert.deepEqual(collectCurrentCeidgPkdCodes({ companies: [{
    id: "one", status: "AKTYWNY",
    szczegoly: { firma: [{ id: "one", status: "WYKRESLONY", pkdGlowny: "4120Z" }] },
  }] }), []);
  assert.deepEqual(collectCurrentCeidgPkdCodes({ companies: [{
    id: "one", status: "AKTYWNY",
    szczegoly: { firma: [{ id: "two", status: "AKTYWNY", pkdGlowny: "4120Z" }] },
  }] }), []);
});
