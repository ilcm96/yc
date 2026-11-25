import * as Schema from "effect/Schema";

import { NonNegativeInt } from "./baseSchemas.ts";

// yc: output tokens over the time spent generating them.
export const OrchestrationV2OutputRate = Schema.Struct({
  outputTokens: NonNegativeInt,
  durationMs: NonNegativeInt,
});
export type OrchestrationV2OutputRate = typeof OrchestrationV2OutputRate.Type;

export const OrchestrationV2OutputSpeed = Schema.Struct({
  /** The request still streaming, estimated, or else the last finished one. */
  latest: Schema.optional(OrchestrationV2OutputRate),
  /** Every finished request, for the average. */
  total: OrchestrationV2OutputRate,
});
export type OrchestrationV2OutputSpeed = typeof OrchestrationV2OutputSpeed.Type;
