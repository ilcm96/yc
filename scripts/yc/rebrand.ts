#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - A one-shot maintenance script; synchronous Node APIs keep it small.
// Replaces the user-facing "T3 Code" name with "YC" (TRADEMARK.md) and carries each translation to
// the new catalog key, since GT keys are hashes of the English text. Safe to rerun after a sync.
// Usage: node scripts/yc/rebrand.ts [--check]
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

// Also the URL-encoded spellings that links carry.
const FROM = /T3( |%20|\+)Code\b/g;
const HAS = /T3( |%20|\+)Code\b/;
const TO = "YC";

const SCOPE = [
  "apps/server/src",
  "apps/web/src",
  "apps/desktop/src",
  "packages/*/src/*",
  "scripts/build-desktop-artifact.ts",
  "scripts/build-desktop-artifact.test.ts",
  // These run in CI and assert on the agent instructions the server builds.
  "evals/mcp-tool-use/*.test.ts",
];
const SKIP_FILE = /(\/i18n\/translations\/|\/_generated\/)/;
// Files that use the name as sample text (a search query, a speech hint, an agent's tool label).
const SKIP_FILES = new Set([
  "packages/shared/src/paletteSearch.test.ts",
  "packages/shared/src/speech.test.ts",
  "packages/shared/src/t3McpToolPresentation.test.ts",
  "apps/server/src/speech/SpeechService.test.ts",
  // Must stay byte-identical to .github/triage/PLAYBOOK.md, which is upstream's.
  "apps/server/src/triage/triagePrompt.ts",
  "apps/server/src/triage/triagePrompt.test.ts",
]);

// Spans that use the name as data rather than as a label, in source and in recorded provider
// frames (*.ndjson). Changing them breaks existing installs, other environments, provider sessions,
// or tests whose fixtures depend on the exact text.
const KEEP = [
  /T3 Code \((Alpha|Dev)\)|T3 Code \\\(/g, // legacy profile and dev-build names on disk
  /(?:\/|\\)T3 Code|T3 Code(?:\/|\\\\)|T3 Code( \(\w+\))?\.(app|exe)\b/g, // install paths, often to test quoting
  /Written by T3 Code/g, // marker that identifies an installed CLI shim
  /T3 Code · (?!v\{)/g, // linked-environment label prefix that other environments parse
  // Client identity sent to providers: Codex's name, title, user agent and originator, and the
  // titles Muse and Antigravity receive.
  /CODEX_CLIENT_NAME = "T3 Code"|clientInfo: \{ name: "T3 Code", title: "T3 Code"|"clientInfo":\{"name":"T3 Code","title":"T3 Code"|\(T3 Code; /g,
  /name: "t3[-_]code", title: "T3 Code"|"name":"t3[-_]code","title":"T3 Code"/g,
  /originator\W+"T3 Code"/gi,
  /GIT_(AUTHOR|COMMITTER)_NAME: "T3 Code"|T3 Code Test/g, // checkpoint and test commit identities
  /^\s*name: "T3 Code",\s*$/g, // MCP server name; agents prefix tool labels with it
  /T3 Code page/g, // the ACP mock agent's canned web page
];

// The gt CLI runs through Node because the `.bin/gt` shim is a shell script Windows cannot spawn.
// Mobile is out of yc's scope but scans packages/{client-runtime,shared}, so its keys follow.
const APPS = [
  { dir: "apps/web", generate: ["node_modules/gt/bin/main.js", "generate"], clean: true },
  { dir: "apps/desktop", generate: ["scripts/i18n-generate.mjs"], clean: true },
  { dir: "apps/mobile", generate: ["node_modules/gt/bin/main.js", "generate"], clean: false },
] as const;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Catalog = Record<string, Json>;

const root = NodePath.resolve(import.meta.dirname, "../..");
const check = process.argv.includes("--check");

const keptSpans = (text: string) =>
  KEEP.flatMap((keep) =>
    [...text.matchAll(keep)].map((match) => [match.index, match.index + match[0].length]),
  );
const rebrandLine = (line: string) => {
  const spans = keptSpans(line);
  return line.replace(FROM, (match: string, _space: string, offset: number) =>
    spans.some(([start, end]) => offset >= start! && offset < end!) ? match : TO,
  );
};
const rebrandValue = (value: Json): Json =>
  typeof value === "string"
    ? value.replace(FROM, TO)
    : Array.isArray(value)
      ? value.map(rebrandValue)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rebrandValue(item)]))
        : value;

// Formatting can rewrap JSX text, which only changes how GT splits its whitespace.
const sameText = (value: Json): string =>
  JSON.stringify(
    Array.isArray(value)
      ? value
          .reduce<Json[]>((parts, part) => {
            const last = parts.at(-1);
            if (typeof part === "string" && typeof last === "string")
              parts[parts.length - 1] = last + part;
            else parts.push(part);
            return parts;
          }, [])
          .map((part) => (typeof part === "string" ? part.replace(/\s+/g, " ") : part))
      : value,
  );

const format = (files: string[]) => {
  if (files.length === 0) return;
  const formatted = NodeChildProcess.spawnSync("vp", ["fmt", ...files], {
    cwd: root,
    encoding: "utf8",
  });
  if (formatted.status !== 0)
    throw new Error(`vp fmt failed\n${formatted.stdout}${formatted.stderr}`);
};

const git = (...args: string[]) =>
  NodeChildProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" });
const readJson = (file: string) => JSON.parse(NodeFS.readFileSync(file, "utf8"));

function catalogsOf(app: (typeof APPS)[number]) {
  const config = readJson(NodePath.join(root, app.dir, "gt.config.json"));
  const dir = NodePath.join(root, app.dir, NodePath.dirname(config.files.gt.output));
  const file = (locale: string) => NodePath.join(dir, `${locale}.json`);
  const locales: string[] = config.locales;
  const read = () => ({
    en: readJson(file(config.defaultLocale)) as Catalog,
    locales: Object.fromEntries(
      locales.map((locale) => [locale, readJson(file(locale)) as Catalog]),
    ),
  });
  return { file, locales, read };
}

const sourceFiles = git("ls-files", "-z", "--", ...SCOPE)
  .split("\0")
  .filter((file) => file !== "" && !SKIP_FILE.test(file) && !SKIP_FILES.has(file));

const changes: string[] = [];
const rewritten = new Map<string, string>();
for (const file of sourceFiles) {
  const text = NodeFS.readFileSync(NodePath.join(root, file), "utf8");
  if (!HAS.test(text)) continue;
  const lines = text.split("\n");
  const next = lines.map(rebrandLine);
  next.forEach((line, index) => {
    if (line !== lines[index]) changes.push(`${file}:${index + 1}: ${lines[index]!.trim()}`);
  });
  if (next.some((line, index) => line !== lines[index])) rewritten.set(file, next.join("\n"));
}

const staleCatalogs = APPS.filter((app) => app.clean).flatMap((app) =>
  Object.values(catalogsOf(app).read().en)
    .map((text) => JSON.stringify(text))
    .filter((text) => HAS.test(text) && rebrandLine(text) !== text)
    .map((text) => `${app.dir} en.json: ${text}`),
);

if (check) {
  const problems = [...changes, ...staleCatalogs];
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error(
      `\n${problems.length} "T3 Code" label(s) left. Run \`node scripts/yc/rebrand.ts\`.`,
    );
    process.exitCode = 1;
  } else {
    console.log('No user-facing "T3 Code" label is left.');
  }
} else {
  const before = APPS.map((app) => catalogsOf(app).read());
  for (const [file, text] of rewritten) NodeFS.writeFileSync(NodePath.join(root, file), text);
  // Format before generating: the catalog keys hash the formatted source text.
  format([...rewritten.keys()].map((file) => NodePath.join(root, file)));

  const written: string[] = [];
  if (rewritten.size > 0 || staleCatalogs.length > 0) {
    APPS.forEach((app, index) => {
      const generated = NodeChildProcess.spawnSync(process.execPath, app.generate, {
        cwd: NodePath.join(root, app.dir),
        encoding: "utf8",
      });
      if (generated.status !== 0) {
        throw new Error(`${app.dir}: i18n generate failed\n${generated.stdout}${generated.stderr}`);
      }
      const catalogs = catalogsOf(app);
      const old = before[index]!;
      const after = catalogs.read();
      // A new key whose English is an old key's English, rebranded, takes that key's translations.
      const oldKeyByText = new Map(
        Object.entries(old.en).map(([key, text]) => [sameText(rebrandValue(text)), key]),
      );
      for (const [key, text] of Object.entries(after.en)) {
        if (Object.hasOwn(old.en, key)) continue;
        const oldKey = oldKeyByText.get(sameText(text));
        if (oldKey === undefined) continue;
        for (const locale of catalogs.locales) {
          const translation = old.locales[locale]?.[oldKey];
          if (translation !== undefined) after.locales[locale]![key] = rebrandValue(translation);
        }
      }
      for (const locale of catalogs.locales) {
        NodeFS.writeFileSync(
          catalogs.file(locale),
          `${JSON.stringify(after.locales[locale], null, 2)}\n`,
        );
        written.push(catalogs.file(locale));
      }
      written.push(catalogs.file("en"));
    });
  }
  format(written);
  console.log(`Rebranded ${changes.length} line(s) in ${rewritten.size} file(s).`);
}
