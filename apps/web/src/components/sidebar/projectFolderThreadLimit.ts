export interface ProjectFolderThreadLimit<T> {
  readonly threads: readonly T[];
  readonly hiddenCount: number;
  readonly nextCount: number;
}

/**
 * Shows an open project folder a page of threads at a time. Hidden threads keep their section,
 * so a long folder never settles anything, and the open thread stays visible past the limit.
 */
export function limitProjectFolderThreads<T>(
  threads: readonly T[],
  options: {
    readonly pages: number;
    readonly keepKey: string | null;
    readonly keyOf: (thread: T) => string;
    readonly limit: number;
  },
): ProjectFolderThreadLimit<T> {
  const { limit, keepKey, keyOf } = options;
  if (threads.length <= limit) {
    return { threads, hiddenCount: 0, nextCount: 0 };
  }
  const shown = threads.slice(0, limit * Math.max(1, options.pages));
  if (keepKey !== null && !shown.some((thread) => keyOf(thread) === keepKey)) {
    const kept = threads.find((thread) => keyOf(thread) === keepKey);
    if (kept !== undefined) shown.push(kept);
  }
  const hiddenCount = threads.length - shown.length;
  return {
    threads: shown,
    hiddenCount,
    nextCount: Math.min(limit, hiddenCount),
  };
}
