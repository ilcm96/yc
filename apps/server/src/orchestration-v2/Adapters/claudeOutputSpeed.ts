/** yc: output tokens per second for the root Claude agent and each Task subagent. */
import type { OrchestrationV2OutputRate, OrchestrationV2OutputSpeed } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import { field, text } from "../unknownField.ts";
import {
  initialWorkflowAgentTranscriptCursor,
  readWorkflowAgentTranscript,
  type WorkflowAgentTranscriptCursor,
} from "../workflowAgentTranscript.ts";

const LIVE_EMIT_INTERVAL_MS = 1_000;
// A live estimate over less is mostly noise, such as thinking the stream summarizes.
const MIN_LIVE_DURATION_MS = 500;
const MIN_LIVE_TOKENS = 50;
const DEFAULT_CHARS_PER_TOKEN = 3.5;
const MIN_CALIBRATION_CHARS = 400;
// Claude Code flushes transcript lines on a timer.
const TRANSCRIPT_FLUSH_MS = 500;

interface MutableRate {
  outputTokens: number;
  durationMs: number;
}

function addRate(total: MutableRate, rate: OrchestrationV2OutputRate): void {
  total.outputTokens += rate.outputTokens;
  total.durationMs += rate.durationMs;
}

function speedOf(
  latest: OrchestrationV2OutputRate | undefined,
  total: MutableRate,
): OrchestrationV2OutputSpeed | undefined {
  if (latest === undefined && total.durationMs === 0) return undefined;
  return { ...(latest === undefined ? {} : { latest }), total: { ...total } };
}

/**
 * The SDK reports a request's output tokens only when it ends, so the streaming
 * request is estimated from its streamed characters and thinking-token estimates.
 */
export interface ClaudeStreamOutputMeter {
  request: { readonly startedAt: number; chars: number; thinkingTokens: number } | null;
  charsPerToken: number;
  lastLiveEmitAt: number;
  latest: OrchestrationV2OutputRate | undefined;
  readonly total: MutableRate;
}

const streamMeters = new WeakMap<object, ClaudeStreamOutputMeter>();

/** One meter per turn context, so a new turn starts a new average. */
export function claudeStreamOutputMeter(turn: object): ClaudeStreamOutputMeter {
  let meter = streamMeters.get(turn);
  if (meter === undefined) {
    meter = {
      request: null,
      charsPerToken: DEFAULT_CHARS_PER_TOKEN,
      lastLiveEmitAt: 0,
      latest: undefined,
      total: { outputTokens: 0, durationMs: 0 },
    };
    streamMeters.set(turn, meter);
  }
  return meter;
}

function streamedChars(event: unknown): number {
  if (field(event, "type") !== "content_block_delta") return 0;
  const delta = field(event, "delta");
  for (const key of ["text", "thinking", "partial_json"]) {
    const value = field(delta, key);
    if (typeof value === "string") return value.length;
  }
  return 0;
}

/**
 * Feeds a root stream event or a `thinking_tokens` frame, which estimates thinking
 * the stream does not show. True when a live estimate is due.
 */
export function meterClaudeOutputFrame(
  meter: ClaudeStreamOutputMeter,
  message: unknown,
  at: number,
): boolean {
  if (field(message, "type") === "system" && field(message, "subtype") === "thinking_tokens") {
    const delta = field(message, "estimated_tokens_delta");
    if (meter.request === null || typeof delta !== "number" || delta <= 0) return false;
    meter.request.thinkingTokens += delta;
    return liveEmitDue(meter, at);
  }
  if (field(message, "type") !== "stream_event" || field(message, "parent_tool_use_id")) {
    return false;
  }
  const event = field(message, "event");
  const type = field(event, "type");
  if (type === "message_start") {
    meter.request = { startedAt: at, chars: 0, thinkingTokens: 0 };
    meter.lastLiveEmitAt = at;
    return false;
  }
  if (type === "message_delta") {
    const outputTokens = field(field(event, "usage"), "output_tokens");
    if (typeof outputTokens === "number") finishRequest(meter, outputTokens, at);
    return false;
  }
  const chars = streamedChars(event);
  if (chars === 0 || meter.request === null) return false;
  meter.request.chars += chars;
  return liveEmitDue(meter, at);
}

function liveEmitDue(meter: ClaudeStreamOutputMeter, at: number): boolean {
  if (at - meter.lastLiveEmitAt < LIVE_EMIT_INTERVAL_MS) return false;
  meter.lastLiveEmitAt = at;
  return true;
}

function finishRequest(meter: ClaudeStreamOutputMeter, outputTokens: number, at: number): void {
  const request = meter.request;
  if (request === null) return;
  meter.request = null;
  const textTokens = outputTokens - request.thinkingTokens;
  if (request.chars >= MIN_CALIBRATION_CHARS && textTokens > 0) {
    meter.charsPerToken = Math.min(8, Math.max(0.8, request.chars / textTokens));
  }
  const durationMs = at - request.startedAt;
  if (outputTokens <= 0 || durationMs <= 0) return;
  meter.latest = { outputTokens, durationMs };
  addRate(meter.total, meter.latest);
}

export function claudeStreamOutputSpeed(
  meter: ClaudeStreamOutputMeter,
  at: number,
): OrchestrationV2OutputSpeed | undefined {
  const request = meter.request;
  const durationMs = request === null ? 0 : at - request.startedAt;
  const estimate =
    request === null ? 0 : Math.round(request.thinkingTokens + request.chars / meter.charsPerToken);
  const live =
    durationMs >= MIN_LIVE_DURATION_MS && estimate >= MIN_LIVE_TOKENS
      ? { outputTokens: estimate, durationMs }
      : undefined;
  return speedOf(live ?? meter.latest, meter.total);
}

/**
 * A subagent's requests from its transcript: each runs from the line before its
 * first assistant line to its last one, and carries its final output tokens.
 */
export interface ClaudeTranscriptRequests {
  lastLineAt: number | undefined;
  open: {
    readonly id: string;
    readonly startedAt: number;
    endedAt: number;
    outputTokens: number;
    stopped: boolean;
  } | null;
  closedId: string | undefined;
  latest: OrchestrationV2OutputRate | undefined;
  readonly total: MutableRate;
}

interface ClaudeTranscriptOutput extends ClaudeTranscriptRequests {
  cursor: WorkflowAgentTranscriptCursor;
}

function newTranscriptOutput(): ClaudeTranscriptOutput {
  return {
    cursor: initialWorkflowAgentTranscriptCursor,
    lastLineAt: undefined,
    open: null,
    closedId: undefined,
    latest: undefined,
    total: { outputTokens: 0, durationMs: 0 },
  };
}

function closeTranscriptRequest(state: ClaudeTranscriptRequests): void {
  const open = state.open;
  if (open === null) return;
  state.open = null;
  state.closedId = open.id;
  const durationMs = open.endedAt - open.startedAt;
  if (open.outputTokens <= 0 || durationMs <= 0) return;
  state.latest = { outputTokens: open.outputTokens, durationMs };
  addRate(state.total, state.latest);
}

/**
 * Claude Code writes a reply's lines once it ends, with its stop reason, so a request
 * is complete once a stopped line was read, a later line follows it, or the subagent settled.
 */
export function absorbClaudeTranscriptOutput(
  target: ClaudeTranscriptRequests,
  lines: ReadonlyArray<unknown>,
  settled: boolean,
): void {
  for (const line of lines) {
    const at = Date.parse(text(field(line, "timestamp")) ?? "");
    if (!Number.isFinite(at)) continue;
    const message = field(line, "message");
    const id = text(field(message, "id"));
    const outputTokens = field(field(message, "usage"), "output_tokens");
    const isModelReply =
      field(line, "type") === "assistant" &&
      id !== undefined &&
      field(message, "model") !== "<synthetic>" &&
      typeof outputTokens === "number";
    if (!isModelReply) {
      closeTranscriptRequest(target);
      target.lastLineAt = at;
      continue;
    }
    if (target.open !== null && target.open.id !== id) closeTranscriptRequest(target);
    const stopped = field(message, "stop_reason") != null;
    // A sibling line read after its reply closed was already counted.
    if (id !== target.closedId && target.open === null) {
      const startedAt = target.lastLineAt ?? at;
      target.open = { id, startedAt, endedAt: at, outputTokens, stopped };
    } else if (target.open !== null) {
      target.open.endedAt = Math.max(target.open.endedAt, at);
      target.open.outputTokens = Math.max(target.open.outputTokens, outputTokens);
      target.open.stopped ||= stopped;
    }
    target.lastLineAt = at;
  }
  if (settled || target.open?.stopped === true) closeTranscriptRequest(target);
}

export function makeClaudeSubagentOutputSpeedReader(input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly configDir: string | undefined;
}) {
  const transcripts = new Map<string, ClaudeTranscriptOutput>();
  const sessionDirs = new Map<string, string>();

  const findSessionDir = Effect.fnUntraced(function* (nativeThreadId: string) {
    const known = sessionDirs.get(nativeThreadId);
    if (known !== undefined) return known;
    const projectsDir = input.path.join(
      input.configDir ?? input.path.join(yield* HostProcess.HomeDirectory, ".claude"),
      "projects",
    );
    // Claude names the project folder after the resolved, possibly hashed, cwd; find the session instead.
    for (const project of yield* input.fileSystem
      .readDirectory(projectsDir)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []))) {
      if (
        yield* input.fileSystem
          .exists(input.path.join(projectsDir, project, `${nativeThreadId}.jsonl`))
          .pipe(Effect.orElseSucceed(() => false))
      ) {
        const subagentsDir = input.path.join(projectsDir, project, nativeThreadId, "subagents");
        sessionDirs.set(nativeThreadId, subagentsDir);
        return subagentsDir;
      }
    }
    return undefined;
  });

  const drain = Effect.fnUntraced(function* (
    transcriptDir: string,
    taskId: string,
    state: ClaudeTranscriptOutput,
    settled: boolean,
  ) {
    for (;;) {
      const read = yield* readWorkflowAgentTranscript({
        transcriptDir,
        agentId: taskId,
        cursor: state.cursor,
        ...(input.configDir === undefined ? {} : { configDir: input.configDir }),
      }).pipe(Effect.option);
      if (Option.isNone(read)) return;
      const advanced = read.value.cursor.offset !== state.cursor.offset;
      state.cursor = read.value.cursor;
      absorbClaudeTranscriptOutput(state, read.value.lines, settled);
      if (!read.value.truncated || !advanced) return;
    }
  });

  /** Reads the lines written since the last call; never fails. */
  const read = Effect.fnUntraced(function* (request: {
    readonly nativeThreadId: string;
    readonly taskId: string;
    readonly settled: boolean;
  }) {
    const transcriptDir = yield* findSessionDir(request.nativeThreadId);
    if (transcriptDir === undefined) return undefined;
    let state = transcripts.get(request.taskId);
    if (state === undefined) {
      state = newTranscriptOutput();
      transcripts.set(request.taskId, state);
    }
    const finished = state.total.durationMs;
    yield* drain(transcriptDir, request.taskId, state, request.settled);
    // The final reply can land just after the task settles.
    if (request.settled && state.total.durationMs === finished) {
      yield* Effect.sleep(TRANSCRIPT_FLUSH_MS);
      yield* drain(transcriptDir, request.taskId, state, true);
    }
    const speed = speedOf(state.latest, state.total);
    if (request.settled) transcripts.delete(request.taskId);
    return speed;
  });

  return { read };
}
