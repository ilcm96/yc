import { createMemoryHistory } from "@tanstack/react-router";
import { ProjectId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The thread route loads ChatView lazily; its first transform would eat the test's timeout.
import "~/components/ChatView";
import {
  __setClientSettingsForTests,
  getClientSettings,
  updateClientSettings,
} from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
  type FakeThread,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

const BETA = ProjectId.make("project-beta");
// One fixture for every test: the app keeps its loaded shell between tests in a file.
const LONG_FOLDER = Array.from({ length: 7 }, (_, index) => threadWithHistory(`long-${index}`, 1));
const THREADS: ReadonlyArray<FakeThread> = [
  ...LONG_FOLDER,
  { ...threadWithHistory("in-beta", 1), projectId: BETA },
];

async function renderApp(boringSidebarEnabled: boolean) {
  await page.viewport(1400, 900);
  const environment = installFakeEnvironment(THREADS, {
    extraProjects: [{ id: BETA, title: "beta" }],
  });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    boringSidebarEnabled,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${THREADS[0]!.id}`] }),
  );
  await router.load();
  const app = await render(<AppRoot router={router} />, { router: false });
  return {
    async [Symbol.asyncDispose]() {
      await app[Symbol.asyncDispose]();
      environment[Symbol.dispose]();
    },
  };
}

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: x,
    clientY: y,
  });

async function drag(source: Element, target: Element) {
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const x = from.x + 10;
  const startY = from.y + from.height / 2;
  const endY = to.y + to.height / 2;
  await act(() => source.dispatchEvent(pointer("pointerdown", x, startY)));
  const steps = 6;
  for (let step = 1; step <= steps; step++) {
    await act(() =>
      document.dispatchEvent(pointer("pointermove", x, startY + ((endY - startY) * step) / steps)),
    );
  }
  await act(() => document.dispatchEvent(pointer("pointerup", x, endY)));
}

const top = (element: Element) => element.getBoundingClientRect().top;

it("reveals a long project folder a configured page at a time until it closes", async () => {
  await using _app = await renderApp(true);
  await act(() => updateClientSettings({ boringSidebarFolderThreadLimit: 3 }));
  const folder = page.getByRole("button", { name: /^render/ });
  await expect.element(folder).toBeVisible();
  const rows = page.getByTestId("sidebar-row-folder").filter({ hasText: "Thread long-" });
  await expect.poll(() => rows.elements().length).toBeLessThanOrEqual(4);
  const shown = rows.elements().length;
  expect(shown).toBeGreaterThanOrEqual(3);

  // The shift guard drops pointer presses on rows that just moved; keys pass.
  page.getByRole("button", { name: "Show 3 more" }).element().focus();
  await userEvent.keyboard("{Enter}");

  await expect.poll(() => rows.elements().length).toBeGreaterThanOrEqual(6);
  folder.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(folder).toHaveAttribute("aria-expanded", "false");
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => rows.elements().length).toBe(shown);
});

it("drags a project folder into a saved manual order", async () => {
  await using _app = await renderApp(true);
  const render = page.getByRole("button", { name: /^render/ });
  const beta = page.getByRole("button", { name: /^beta/ });
  await expect.element(render).toBeVisible();
  await expect.element(beta).toBeVisible();
  const [upper, lower] =
    top(render.element()) < top(beta.element()) ? [render, beta] : [beta, render];

  await drag(lower.element(), upper.element());

  await vi.waitFor(() => expect(top(lower.element())).toBeLessThan(top(upper.element())));
  expect(getClientSettings().sidebarProjectSortOrder).toBe("manual");
  await expect.element(lower).toHaveAttribute("aria-expanded", "true");
});

it("drags a project in the picker into a saved manual order", async () => {
  await using _app = await renderApp(false);
  await page.getByLabelText("Filter threads by project").click();
  const render = page.getByRole("option", { name: "render" });
  const beta = page.getByRole("option", { name: "beta" });
  await expect.element(render).toBeVisible();
  await expect.element(beta).toBeVisible();
  const [upper, lower] =
    top(render.element()) < top(beta.element()) ? [render, beta] : [beta, render];
  const handle = lower.element().querySelector('[data-testid="project-scope-drag-handle"]')!;

  await drag(handle, upper.element());

  await vi.waitFor(() => expect(top(lower.element())).toBeLessThan(top(upper.element())));
  expect(getClientSettings().sidebarProjectSortOrder).toBe("manual");
  // A drag is not a pick, so the picker stays open on every project.
  await expect.element(upper).toBeVisible();
});
