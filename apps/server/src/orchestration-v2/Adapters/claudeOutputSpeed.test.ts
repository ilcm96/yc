import { describe, expect, it } from "vite-plus/test";

import {
  absorbClaudeTranscriptOutput,
  claudeStreamOutputMeter,
  claudeStreamOutputSpeed,
  type ClaudeTranscriptRequests,
  meterClaudeOutputFrame,
} from "./claudeOutputSpeed.ts";

const stream = (event: unknown, parent: string | null = null) => ({
  type: "stream_event",
  parent_tool_use_id: parent,
  event,
});
const textDelta = (text: string, parent: string | null = null) =>
  stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, parent);
const messageDelta = (outputTokens: number) =>
  stream({ type: "message_delta", usage: { output_tokens: outputTokens } });

const transcriptLine = (
  type: "user" | "assistant",
  timestamp: string,
  message: { id?: string; outputTokens?: number; stopReason?: string } = {},
) => ({
  type,
  uuid: `${type}-${timestamp}`,
  timestamp: `2026-11-25T06:02:${timestamp}Z`,
  message:
    type === "assistant"
      ? {
          id: message.id,
          model: "claude-haiku-5-5",
          stop_reason: message.stopReason ?? null,
          usage: { output_tokens: message.outputTokens },
        }
      : { role: "user", content: [] },
});

describe("claude stream output meter", () => {
  it("measures finished root requests and estimates the streaming one", () => {
    const meter = claudeStreamOutputMeter({});
    meterClaudeOutputFrame(meter, stream({ type: "message_start" }), 0);
    meterClaudeOutputFrame(meter, textDelta("x".repeat(800)), 1_000);
    meterClaudeOutputFrame(meter, messageDelta(200), 2_000);

    meterClaudeOutputFrame(meter, stream({ type: "message_start" }), 3_000);
    const liveDue = meterClaudeOutputFrame(meter, textDelta("y".repeat(400)), 4_000);
    meterClaudeOutputFrame(
      meter,
      { type: "system", subtype: "thinking_tokens", estimated_tokens_delta: 50 },
      4_000,
    );
    // A subagent's stream is not the root agent's output.
    meterClaudeOutputFrame(meter, textDelta("z".repeat(4_000), "toolu_child"), 4_000);

    expect(liveDue).toBe(true);
    expect(claudeStreamOutputSpeed(meter, 4_000)).toEqual({
      latest: { outputTokens: 150, durationMs: 1_000 },
      total: { outputTokens: 200, durationMs: 2_000 },
    });
    meterClaudeOutputFrame(meter, messageDelta(160), 5_000);
    expect(claudeStreamOutputSpeed(meter, 5_000)).toEqual({
      latest: { outputTokens: 160, durationMs: 2_000 },
      total: { outputTokens: 360, durationMs: 4_000 },
    });
  });

  it("keeps a new turn's average separate", () => {
    const earlier = claudeStreamOutputMeter({});
    meterClaudeOutputFrame(earlier, stream({ type: "message_start" }), 0);
    meterClaudeOutputFrame(earlier, messageDelta(100), 1_000);

    const next = claudeStreamOutputMeter({});

    expect(claudeStreamOutputSpeed(next, 1_000)).toBeUndefined();
  });
});

describe("absorbClaudeTranscriptOutput", () => {
  const empty = (): ClaudeTranscriptRequests => ({
    lastLineAt: undefined,
    open: null,
    closedId: undefined,
    latest: undefined,
    total: { outputTokens: 0, durationMs: 0 },
  });

  it("closes a request once a later line follows it, and the last one when settled", () => {
    const state = empty();
    const lines = [
      transcriptLine("user", "36.000"),
      transcriptLine("assistant", "37.500", { id: "msg_1", outputTokens: 213 }),
      transcriptLine("assistant", "38.000", { id: "msg_1", outputTokens: 213 }),
      transcriptLine("user", "38.400"),
      transcriptLine("assistant", "40.000", { id: "msg_2", outputTokens: 1_369 }),
      transcriptLine("assistant", "46.400", { id: "msg_2", outputTokens: 1_369 }),
    ];

    absorbClaudeTranscriptOutput(state, lines, false);

    expect(state.latest).toEqual({ outputTokens: 213, durationMs: 2_000 });
    expect(state.total).toEqual({ outputTokens: 213, durationMs: 2_000 });

    absorbClaudeTranscriptOutput(state, [], true);

    expect(state.latest).toEqual({ outputTokens: 1_369, durationMs: 8_000 });
    expect(state.total).toEqual({ outputTokens: 1_582, durationMs: 10_000 });
  });

  it("closes a stopped reply once read and counts a late sibling line once", () => {
    const state = empty();
    const reply = { id: "msg_1", outputTokens: 255, stopReason: "tool_use" };

    absorbClaudeTranscriptOutput(
      state,
      [transcriptLine("user", "13.000"), transcriptLine("assistant", "16.000", reply)],
      false,
    );
    absorbClaudeTranscriptOutput(state, [transcriptLine("assistant", "16.500", reply)], false);

    expect(state.total).toEqual({ outputTokens: 255, durationMs: 3_000 });
  });
});
