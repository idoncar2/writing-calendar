function normalizeRoot(root: string): string {
  const normalized = root.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "..")) {
    throw new Error("Invalid writing calendar data folder.");
  }
  return normalized;
}

export function safePathSegment(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/[.\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[<>:"|?*\u0000-\u001f]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("Identifier cannot be converted to a safe path segment.");
  }
  return normalized;
}

export function ledgerPath(root: string, deviceId: string, timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid ledger timestamp.");
  const month = date.toISOString().slice(0, 7);
  return `${normalizeRoot(root)}/ledgers/${safePathSegment(deviceId)}/${month}.jsonl`;
}

export function deviceMetadataPath(root: string, deviceId: string): string {
  return `${normalizeRoot(root)}/devices/${safePathSegment(deviceId)}.json`;
}

export function projectVersionPath(
  root: string,
  projectId: string,
  deviceId: string,
  timestamp: string,
): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid project version timestamp.");
  const compact = date.toISOString().replace(/[-:.]/g, "");
  return `${normalizeRoot(root)}/projects/${safePathSegment(projectId)}/${compact}-${safePathSegment(deviceId)}.json`;
}
