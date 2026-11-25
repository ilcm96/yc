import { describe, expect, it } from "vite-plus/test";

import { displayedOutputSpeed, subagentGroupOutputSpeed } from "./outputSpeed.logic";

const speed = (latest: [number, number] | undefined, total: [number, number]) => ({
  ...(latest === undefined ? {} : { latest: { outputTokens: latest[0], durationMs: latest[1] } }),
  total: { outputTokens: total[0], durationMs: total[1] },
});

describe("displayedOutputSpeed", () => {
  it("shows the latest request while running and the average once settled", () => {
    const reported = speed([300, 2_000], [1_000, 10_000]);

    expect(displayedOutputSpeed(reported, true)).toEqual({ tokensPerSecond: 150, average: false });
    expect(displayedOutputSpeed(reported, false)).toEqual({ tokensPerSecond: 100, average: true });
    // A span this short is request latency, not output speed.
    expect(displayedOutputSpeed(speed([5, 100], [5, 100]), true)).toBeNull();
  });
});

describe("subagentGroupOutputSpeed", () => {
  it("weights running members by tokens, then averages every member once none runs", () => {
    const short = { status: "running" as const, outputSpeed: speed([100, 2_000], [100, 2_000]) };
    const long = {
      status: "running" as const,
      outputSpeed: speed([1_500, 10_000], [3_000, 20_000]),
    };
    const done = { status: "completed" as const, outputSpeed: speed([900, 3_000], [900, 3_000]) };

    expect(subagentGroupOutputSpeed([short, long, done])).toEqual({
      tokensPerSecond: 133,
      average: false,
    });
    expect(
      subagentGroupOutputSpeed([
        { ...short, status: "completed" },
        { ...long, status: "completed" },
        done,
      ]),
    ).toEqual({ tokensPerSecond: 160, average: true });
    expect(subagentGroupOutputSpeed([{ status: "running" }])).toBeNull();
  });
});
