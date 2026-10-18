// Reads each class's Steps database from Notion and writes site/data/<code>.json
// plus site/data/classes.json. Runs in GitHub Actions; the Notion key comes from
// the NOTION_TOKEN secret and never reaches the published site.
//
// Local test without Notion: NOTION_MOCK=tests/mock-notion.json node scripts/sync.mjs

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CLASSES_DIR = path.join(ROOT, "classes");
const OUT_DIR = path.join(ROOT, "site", "data");
const TOKEN = process.env.NOTION_TOKEN;
const MOCK = process.env.NOTION_MOCK;

const plain = (rich) => (Array.isArray(rich) ? rich.map((r) => r.plain_text || "").join("") : "");
const bare = (id) => String(id || "").replace(/-/g, "");

async function notion(url, body, version) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": version,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { message: text }; }
  if (!res.ok) {
    const err = new Error(`Notion ${res.status}: ${json.code || ""} ${json.message || ""}`.trim());
    err.status = res.status;
    throw err;
  }
  return json;
}

async function queryAll(cls) {
  if (MOCK) return JSON.parse(await readFile(path.resolve(ROOT, MOCK), "utf8")).results;
  const body = { page_size: 100, sorts: [{ property: "Order", direction: "ascending" }] };
  const attempts = [
    { url: `https://api.notion.com/v1/data_sources/${cls.stepsDataSourceId}/query`, version: "2025-09-03" },
    { url: `https://api.notion.com/v1/databases/${cls.stepsDatabaseId}/query`, version: "2022-06-28" },
  ];
  let lastErr;
  for (const a of attempts) {
    try {
      const results = [];
      let cursor;
      do {
        const page = await notion(a.url, cursor ? { ...body, start_cursor: cursor } : body, a.version);
        results.push(...page.results);
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      return results;
    } catch (e) {
      lastErr = e;
      if (e.status === 401) break; // bad key: the fallback will fail the same way
    }
  }
  throw lastErr;
}

function toStep(page, cls) {
  const p = page.properties || {};
  const rel = (p.Submission && p.Submission.relation) || [];
  const order = (p.Order && p.Order.number) ?? 999;
  const taskId = rel[0] ? bare(rel[0].id) : bare(cls.tasks[order <= 11 ? 0 : 1]?.id);
  return {
    step: plain(p.Step && p.Step.title) || "Untitled step",
    order,
    task: taskId,
    done: !!(p.Reviewed && p.Reviewed.checkbox),
    due: (p.Due && p.Due.date && p.Due.date.start) || null,
    completed: (p["Date Completed"] && p["Date Completed"].date && p["Date Completed"].date.start) || null,
    warmup: plain(p.Warmup && p.Warmup.rich_text),
    check: plain(p.Check && p.Check.rich_text),
    answer: plain(p.Answer && p.Answer.rich_text),
    go: (p["Go To"] && p["Go To"].url) || "",
    also: (p["Also Open"] && p["Also Open"].url) || "",
  };
}

async function main() {
  if (!TOKEN && !MOCK) {
    console.error("NOTION_TOKEN is not set. Add it under Settings, Secrets and variables, Actions.");
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(CLASSES_DIR)).filter((f) => f.endsWith(".json"));
  const index = [];
  let failures = 0;
  for (const f of files) {
    const cls = JSON.parse(await readFile(path.join(CLASSES_DIR, f), "utf8"));
    const slug = cls.code.toLowerCase();
    try {
      const rows = await queryAll(cls);
      const steps = rows.map((r) => toStep(r, cls)).sort((a, b) => a.order - b.order);
      const out = {
        code: cls.code,
        name: cls.name,
        finalTarget: cls.finalTarget,
        notionPage: cls.notionPage,
        tasks: cls.tasks.map((t) => ({ ...t, id: bare(t.id) })),
        syncedAt: new Date().toISOString(),
        steps,
      };
      await writeFile(path.join(OUT_DIR, `${slug}.json`), JSON.stringify(out, null, 1));
      index.push({ code: cls.code, slug, name: cls.name, active: !!cls.active });
      console.log(`${cls.code}: ${steps.length} steps, ${steps.filter((s) => s.done).length} done`);
    } catch (e) {
      failures++;
      console.error(`${cls.code}: ${e.message}`);
      if (e.status === 404) console.error("  Connect the integration to the class page in Notion: ••• menu, Connections.");
      if (e.status === 401) console.error("  The NOTION_TOKEN secret is wrong or was revoked.");
    }
  }
  await writeFile(path.join(OUT_DIR, "classes.json"), JSON.stringify({ classes: index }, null, 1));
  if (failures && !index.length) process.exit(1);
}

main();
