import { createMemoryHistory } from "@tanstack/react-router";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  type OrchestrationV2ProviderThread,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily; importing it keeps its first transform out of the timeout.
import "~/components/ChatView";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  CLAUDE_PROVIDER,
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../../test/fakeEnvironment";
import { render } from "../../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock(
  "../../../../../packages/client-runtime/src/connection/driver.ts",
  async (importOriginal) => {
    const [actual, { fakeDriver }, Layer] = await Promise.all([
      importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
      import("../../../test/fakeEnvironment"),
      import("effect/Layer"),
    ]);
    return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
  },
);

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const CLAUDE = ProviderInstanceId.make("claudeAgent");
const CLAUDE_DRIVER = ProviderDriverKind.make("claudeAgent");

function claudeThreadUsing(contextUsage: OrchestrationV2ProviderThread["contextUsage"]) {
  const thread = threadWithHistory("context-ring", 1, {
    instanceId: CLAUDE,
    model: "claude-opus-4-6",
  });
  const at = DateTime.makeUnsafe("2026-03-17T19:12:28.000Z");
  const providerThread: OrchestrationV2ProviderThread = {
    id: ProviderThreadId.make("provider-thread-context-ring"),
    driver: CLAUDE_DRIVER,
    providerInstanceId: CLAUDE,
    providerSessionId: null,
    appThreadId: thread.id,
    ownerNodeId: null,
    nativeThreadRef: { driver: CLAUDE_DRIVER, nativeId: "native-context-ring", strength: "strong" },
    nativeConversationHeadRef: null,
    status: "idle",
    firstRunOrdinal: 1,
    lastRunOrdinal: 1,
    handoffIds: [],
    forkedFrom: null,
    pendingBackgroundTasks: [],
    contextUsage,
    nativeMetadata: null,
    goal: null,
    createdAt: at,
    updatedAt: at,
  };
  return { ...thread, providerThreads: [providerThread] };
}

it("shows the thread's context usage as a ring beside the composer's send button", async () => {
  const thread = claudeThreadUsing({ usedTokens: 250_000, maxTokens: 1_000_000 });
  using _environment = installFakeEnvironment([thread], { providers: [CLAUDE_PROVIDER] });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });

  const ring = page.getByRole("button", { name: "Context: 25% used" });
  await expect.element(ring).toBeVisible();
  await ring.hover();

  await expect.element(page.getByText("250,000 of 1,000,000 tokens")).toBeVisible();
});

it("scales the ring to a compaction limit set below the model's window", async () => {
  const thread = claudeThreadUsing({
    usedTokens: 117_000,
    maxTokens: 1_000_000,
    autoCompactThreshold: 467_000,
  });
  using _environment = installFakeEnvironment([thread], { providers: [CLAUDE_PROVIDER] });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  await using _app = await render(<AppRoot router={router} />, { router: false });

  const ring = page.getByRole("button", { name: "Context: 25% used" });
  await expect.element(ring).toBeVisible();
  await ring.hover();

  await expect.element(page.getByText("117,000 of 467,000 tokens")).toBeVisible();
});
