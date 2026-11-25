import { useGT } from "gt-react";

import type { DisplayedOutputSpeed } from "./outputSpeed.logic";

/** yc: output tokens per second beside an elapsed time. */
export function OutputSpeedLabel({ speed }: { readonly speed: DisplayedOutputSpeed | null }) {
  const gt = useGT();
  if (speed === null) return null;
  const rate = speed.tokensPerSecond;
  return (
    <span
      className="shrink-0 text-xs text-muted-foreground tabular-nums"
      data-testid="output-speed"
    >
      {speed.average ? gt("avg {rate} tok/s", { rate }) : gt("{rate} tok/s", { rate })}
    </span>
  );
}
