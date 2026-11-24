import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { useGT, useLocale, useMessages } from "gt-react";
import { memo } from "react";

import { formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatContextWindowCompactionMessage } from "./compaction.logic";

const RADIUS = 9.75;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The composer's context gauge. Its copy matches Thread details so both share translations. */
export const ContextWindowRing = memo(function ContextWindowRing({
  usage,
}: {
  readonly usage: ContextWindowSnapshot;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const threshold =
    usage.autoCompactThreshold != null && usage.autoCompactThreshold > 0
      ? usage.autoCompactThreshold
      : null;
  const modelMax = usage.maxTokens != null && usage.maxTokens > 0 ? usage.maxTokens : null;
  // A compaction limit set below the model's window is where context runs out, so it is the scale.
  const maxTokens =
    threshold !== null && (modelMax === null || threshold < modelMax) ? threshold : modelMax;
  const used =
    maxTokens !== null
      ? Math.round(Math.max(0, Math.min(100, (usage.usedTokens / maxTokens) * 100)))
      : null;
  const usedTokens = formatContextWindowTokens(usage.usedTokens);
  const summary =
    used !== null
      ? gt("Context: {used}% used", { used })
      : gt("Context: {usedTokens} tokens used", { usedTokens });
  const tone = used === null ? null : used >= 90 ? "error" : used >= 80 ? "warning" : null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7 shrink-0"
            aria-label={summary}
            data-testid="context-window-ring"
          />
        }
      >
        <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            strokeWidth="3"
            className="stroke-muted-foreground/24"
          />
          {used !== null ? (
            <circle
              cx="12"
              cy="12"
              r={RADIUS}
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - used / 100)}
              className={cn(
                "transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none",
                tone === "error"
                  ? "stroke-error"
                  : tone === "warning"
                    ? "stroke-warning"
                    : "stroke-muted-foreground",
              )}
            />
          ) : null}
        </svg>
      </TooltipTrigger>
      <TooltipPopup side="top" align="end">
        <span className="flex flex-col gap-0.5 text-xs">
          <span className="text-foreground">{summary}</span>
          {maxTokens !== null ? (
            <span className="text-muted-foreground tabular-nums">
              {gt("{used} of {max} tokens", {
                used: usage.usedTokens.toLocaleString(locale),
                max: maxTokens.toLocaleString(locale),
              })}
            </span>
          ) : null}
          {threshold !== null ? (
            <span className="text-muted-foreground">
              {formatContextWindowCompactionMessage(threshold, m)}
            </span>
          ) : null}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
});
