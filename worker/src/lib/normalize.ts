/**
 * Normalize a value to 0-100.
 * When totalCount < 50, use fixed-range normalization.
 * Otherwise, use percentile-based normalization.
 */
export function normalizeValue(
  value: number,
  allValues: number[],
  fixedMin = 0,
  fixedMax = 100
): number {
  if (allValues.length < 50) {
    // Fixed range normalization for small samples
    if (fixedMax === fixedMin) return 50;
    const clamped = Math.max(fixedMin, Math.min(fixedMax, value));
    return ((clamped - fixedMin) / (fixedMax - fixedMin)) * 100;
  }

  // Percentile-based normalization
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v <= value).length;
  return (rank / sorted.length) * 100;
}

/** Recency factor: exponential decay, 1.0 for today, ~0 for 365+ days ago */
export function recencyFactor(dateStr: string | null): number {
  if (!dateStr) return 0;
  const daysSince = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 0) return 1;
  // Half-life of 30 days
  return Math.exp(-daysSince * (Math.LN2 / 30));
}

/** Repo age factor: 0-1, caps at 2 years */
export function repoAgeFactor(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.min(ageDays / 730, 1); // Cap at 2 years
}

/** README quality score: 0-1 based on length */
export function readmeLengthScore(readme: string | null): number {
  if (!readme) return 0;
  const len = readme.length;
  if (len < 100) return 0.1;
  if (len < 500) return 0.3;
  if (len < 1000) return 0.5;
  if (len < 3000) return 0.7;
  if (len < 5000) return 0.9;
  return 1;
}
