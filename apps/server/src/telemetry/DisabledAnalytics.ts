// yc: product analytics never leave the machine, whatever T3CODE_TELEMETRY_ENABLED says.
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as AnalyticsService from "./AnalyticsService.ts";

const ignore = () => Effect.void;
// Nothing is queued, as when telemetry is off.
const drop = () => Effect.succeed(false);

export const layer = Layer.succeed(
  AnalyticsService.AnalyticsService,
  AnalyticsService.AnalyticsService.of({
    record: drop,
    flush: Effect.void,
    recordOwners: ignore,
  }),
);
