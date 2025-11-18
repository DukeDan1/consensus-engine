export function cleanOntologyLabel(rawLabel?: string | null): string | undefined {
  if (typeof rawLabel !== "string") return undefined;
  const trimmed = rawLabel.trim();
  if (!trimmed) return undefined;
  const cleaned = trimmed.replace(/\s*\(medtop:[^)]+\)\s*/gi, "").trim();
  return cleaned.length > 0 ? cleaned : trimmed;
}
