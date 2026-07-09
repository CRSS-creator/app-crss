export function splitContactValues(value: string | null | undefined) {
  return Array.from(
    new Set(
      (value || "")
        .split(/[;,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function splitEmails(value: string | null | undefined) {
  return splitContactValues(value).filter((item) => item.includes("@"));
}

export function splitPhones(value: string | null | undefined) {
  return splitContactValues(value);
}

export function hasEmail(value: string | null | undefined) {
  return splitEmails(value).length > 0;
}

export function hasPhone(value: string | null | undefined) {
  return splitPhones(value).length > 0;
}

export function normalizeContactList(value: string | null | undefined) {
  const values = splitContactValues(value);
  return values.length > 0 ? values.join("; ") : null;
}
