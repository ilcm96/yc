import { describe, expect, it } from "vite-plus/test";

import { limitProjectFolderThreads } from "./projectFolderThreadLimit";

const keyOf = (thread: string) => thread;
const threads = ["a", "b", "c", "d", "e", "f", "g"];
const options = { keepKey: null, keyOf, limit: 3 };

describe("limitProjectFolderThreads", () => {
  it("shows the first page and offers the next one", () => {
    const result = limitProjectFolderThreads(threads, { ...options, pages: 1 });

    expect(result).toEqual({
      threads: ["a", "b", "c"],
      hiddenCount: 4,
      nextCount: 3,
    });
  });

  it("adds a page per Show more and offers only what is left", () => {
    const result = limitProjectFolderThreads(threads, { ...options, pages: 2 });

    expect(result).toEqual({
      threads: ["a", "b", "c", "d", "e", "f"],
      hiddenCount: 1,
      nextCount: 1,
    });
  });

  it("shows every thread once the pages run out", () => {
    const result = limitProjectFolderThreads(threads, { ...options, pages: 3 });

    expect(result).toEqual({ threads, hiddenCount: 0, nextCount: 0 });
  });

  it("keeps the open thread visible past the shown pages", () => {
    const result = limitProjectFolderThreads(threads, { ...options, pages: 1, keepKey: "g" });

    expect(result).toEqual({
      threads: ["a", "b", "c", "g"],
      hiddenCount: 3,
      nextCount: 3,
    });
  });

  it("offers no Show more for a short folder", () => {
    const result = limitProjectFolderThreads(threads.slice(0, 3), { ...options, pages: 2 });

    expect(result).toEqual({
      threads: threads.slice(0, 3),
      hiddenCount: 0,
      nextCount: 0,
    });
  });
});
