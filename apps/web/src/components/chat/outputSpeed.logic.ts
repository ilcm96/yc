import type {
  OrchestrationV2OutputRate,
  OrchestrationV2OutputSpeed,
  OrchestrationV2TurnItemStatus,
} from "@t3tools/contracts";

/** yc: output tokens per second, and whether it averages finished work. */
export interface DisplayedOutputSpeed {
  readonly tokensPerSecond: number;
  readonly average: boolean;
}

// Shorter spans are mostly request latency.
const MIN_DURATION_MS = 250;

function toDisplayed(
  rate: OrchestrationV2OutputRate | undefined,
  average: boolean,
): DisplayedOutputSpeed | null {
  if (rate === undefined || rate.outputTokens <= 0 || rate.durationMs < MIN_DURATION_MS) {
    return null;
  }
  return { tokensPerSecond: Math.round((rate.outputTokens * 1000) / rate.durationMs), average };
}

/** While running, the request streaming now or the last one; once settled, the average. */
export function displayedOutputSpeed(
  speed: OrchestrationV2OutputSpeed | undefined,
  running: boolean,
): DisplayedOutputSpeed | null {
  if (speed === undefined) return null;
  return running ? toDisplayed(speed.latest ?? speed.total, false) : toDisplayed(speed.total, true);
}

const isActive = (status: OrchestrationV2TurnItemStatus) =>
  status === "pending" || status === "running" || status === "waiting";

/** Token-weighted over the running members, or over all of them once none runs. */
export function subagentGroupOutputSpeed(
  members: ReadonlyArray<{
    readonly status: OrchestrationV2TurnItemStatus;
    readonly outputSpeed?: OrchestrationV2OutputSpeed | undefined;
  }>,
): DisplayedOutputSpeed | null {
  const running = members.filter((member) => isActive(member.status));
  const rates = (running.length > 0 ? running : members).flatMap(({ outputSpeed }) => {
    const rate =
      running.length > 0 ? (outputSpeed?.latest ?? outputSpeed?.total) : outputSpeed?.total;
    return rate === undefined ? [] : [rate];
  });
  if (rates.length === 0) return null;
  const sum = rates.reduce(
    (total, rate) => ({
      outputTokens: total.outputTokens + rate.outputTokens,
      durationMs: total.durationMs + rate.durationMs,
    }),
    { outputTokens: 0, durationMs: 0 },
  );
  return toDisplayed(sum, running.length === 0);
}
