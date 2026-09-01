export function missingVaultPaths(
  indexedPaths: readonly string[],
  vaultCandidatePaths: readonly string[],
): string[] {
  const present = new Set(vaultCandidatePaths);
  return indexedPaths.filter((path) => !present.has(path)).sort();
}
