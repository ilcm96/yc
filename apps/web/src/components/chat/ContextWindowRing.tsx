import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import type { ServerProviderUsageWindow } from "@t3tools/contracts";
import { collectProviderUsageLimits, remainingPercent } from "@t3tools/shared/usageLimits";
import { formatDuration, formatResetsIn, limitsNotice } from "@t3tools/shared/usageLimitsCopy";
import { useGT, useLocale, useMessages } from "gt-react";
import { memo } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { formatContextWindowTokens } from "../../lib/contextWindow";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { composerFloatingLayerProps } from "./composerEventScope";
import type { ThreadDetailsUsageInput } from "./ThreadDetailsUsage";

const RADIUS = 9.75;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface ContextRing {
  readonly usage: ContextWindowSnapshot;
  readonly promptCacheExpiresAt: string | null;
  readonly limits: Omit<ThreadDetailsUsageInput, "contextWindow">;
}

/** The composer's context gauge, styled after the context meter upstream removed from the footer. */
export const ContextWindowRing = memo(function ContextWindowRing({
  usage,
  promptCacheExpiresAt,
  limits,
}: ContextRing) {
  const gt = useGT();
  const used = contextUsedPercent(usage);
  const usedTokens = formatContextWindowTokens(usage.usedTokens);
  const summary =
    used !== null
      ? gt("Context: {used}% used", { used: used.percent })
      : gt("Context: {usedTokens} tokens used", { usedTokens });
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
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
              strokeDashoffset={CIRCUMFERENCE * (1 - used.percent / 100)}
              className="stroke-muted-foreground/72 transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
            />
          ) : null}
        </svg>
      </PopoverTrigger>
      <PopoverPopup
        {...composerFloatingLayerProps}
        tooltipStyle
        side="top"
        align="end"
        padding="none"
        width="sm"
        className="text-left whitespace-normal"
      >
        <ContextRingDetails
          usage={usage}
          used={used}
          summary={summary}
          promptCacheExpiresAt={promptCacheExpiresAt}
          limits={limits}
        />
      </PopoverPopup>
    </Popover>
  );
});

/** Mounted only while the popover is open, so its minute clock does not run behind a closed ring. */
function ContextRingDetails({
  usage,
  used,
  summary,
  promptCacheExpiresAt,
  limits,
}: ContextRing & {
  readonly used: ReturnType<typeof contextUsedPercent>;
  readonly summary: string;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const usedTokens = formatContextWindowTokens(usage.usedTokens);
  const limitWindows = providerLimitWindows(limits, now, m);
  return (
    <div className="flex flex-col gap-2 p-(--floating-content-inset) text-2xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-muted-foreground text-xs">{gt("Context window")}</span>
        <span className="text-secondary-label tabular-nums">
          {used !== null
            ? `${used.percent}% · ${usedTokens}/${formatContextWindowTokens(used.maxTokens)}`
            : usedTokens}
        </span>
      </div>
      {used !== null ? <UsageBar percent={used.percent} label={summary} /> : null}
      {promptCacheExpiresAt !== null || usage.cost != null ? (
        <div className="flex flex-col gap-1">
          {promptCacheExpiresAt !== null ? (
            <DetailRow
              label={gt("Prompt cache")}
              value={promptCacheLabel(Date.parse(promptCacheExpiresAt) - now, gt, m)}
            />
          ) : null}
          {usage.cost != null ? (
            <DetailRow label={gt("Cost")} value={formatSessionCost(usage.cost, locale)} strong />
          ) : null}
        </div>
      ) : null}
      {limitWindows.length > 0 ? (
        <div className="mt-1 flex flex-col gap-1.5">
          <span className="font-medium text-muted-foreground text-xs">{gt("Usage limits")}</span>
          {limitWindows.map((window) => {
            const left = remainingPercent(window);
            const resetsIn = formatResetsIn(window, now, m);
            const value = gt("{left}% left", { left });
            return (
              <div key={window.id} className="flex flex-col gap-1">
                <DetailRow
                  label={window.label}
                  value={resetsIn === null ? value : `${value} · ${resetsIn}`}
                />
                <UsageBar percent={100 - left} label={window.label} thin />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({
  label,
  value,
  strong = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 leading-4">
      <span className="text-secondary-label">{label}</span>
      <span
        className={
          strong
            ? "font-medium text-secondary-label tabular-nums"
            : "text-secondary-label tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

function UsageBar({
  percent,
  label,
  thin = false,
}: {
  readonly percent: number;
  readonly label: string;
  readonly thin?: boolean;
}) {
  return (
    <div
      className={
        thin
          ? "h-1 w-full overflow-hidden rounded-full bg-muted/60"
          : "h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
      }
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-muted-foreground/72 transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function contextUsedPercent(usage: ContextWindowSnapshot) {
  const threshold =
    usage.autoCompactThreshold != null && usage.autoCompactThreshold > 0
      ? usage.autoCompactThreshold
      : null;
  const modelMax = usage.maxTokens != null && usage.maxTokens > 0 ? usage.maxTokens : null;
  // A compaction limit set below the model's window is where context runs out, so it is the scale.
  const maxTokens =
    threshold !== null && (modelMax === null || threshold < modelMax) ? threshold : modelMax;
  if (maxTokens === null) return null;
  const percent = Math.round(Math.max(0, Math.min(100, (usage.usedTokens / maxTokens) * 100)));
  return { percent, maxTokens };
}

/** The same windows Thread details shows for the selected provider instance. */
function providerLimitWindows(
  { providerInstanceId, providers, sources }: ContextRing["limits"],
  now: number,
  m: ReturnType<typeof useMessages>,
): readonly ServerProviderUsageWindow[] {
  if (providerInstanceId === null) return [];
  const report = collectProviderUsageLimits(providerInstanceId, providers, sources, now);
  const limits =
    report?.accounts.find((entry) => entry.instanceId === providerInstanceId)?.limits ??
    providers.find((provider) => provider.instanceId === providerInstanceId)?.usageLimits;
  if (!limits || limitsNotice(limits, m) !== null) return [];
  return limits.windows;
}

function promptCacheLabel(
  remainingMs: number,
  gt: ReturnType<typeof useGT>,
  m: ReturnType<typeof useMessages>,
) {
  if (remainingMs <= 0) return gt("Expired");
  if (remainingMs < 60_000) return gt("Expires in a moment");
  return gt("Expires in {duration}", { duration: formatDuration(remainingMs, m) });
}

function formatSessionCost(cost: NonNullable<ContextWindowSnapshot["cost"]>, locale: string) {
  const fractionDigits = cost.amount > 0 && cost.amount < 0.01 ? 4 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cost.currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(cost.amount);
  } catch {
    // ACP providers may report a currency that is not an ISO 4217 code.
    return `${cost.currency} ${cost.amount.toFixed(fractionDigits)}`;
  }
}
