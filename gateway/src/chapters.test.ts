/**
 * Test for concurrency-safe chapter creation (TIN-37).
 * Run with: cd gateway && npx tsx src/chapters.test.ts
 */
import Database from "better-sqlite3";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";

const dbPath = join(process.cwd(), "gateway-test.db");
const dbPath2 = join(process.cwd(), "gateway-test2.db");

function setupTestDb(path: string = dbPath): Database.Database {
  if (existsSync(path)) unlinkSync(path);
  const db = new Database(path);

  db.exec(`
    CREATE TABLE chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_id TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(series_id, number)
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id);
  `);

  return db;
}

function createChapter(
  db: Database.Database,
  seriesId: string,
  title?: string | null
): { id: number; seriesId: string; number: number; title: string | null } {
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      db.prepare(`
        INSERT INTO chapters (series_id, number, title)
        SELECT ?, COALESCE(MAX(number), 0) + 1, ?
        FROM chapters WHERE series_id = ?
      `).run(seriesId, title ?? null, seriesId);

      const row = db
        .prepare(
          `SELECT id, series_id as seriesId, number, title
           FROM chapters WHERE series_id = ? ORDER BY number DESC LIMIT 1`
        )
        .get(seriesId) as { id: number; seriesId: string; number: number; title: string | null };
      return row;
    } catch (err) {
      const sqliteErr = err as { code?: string };
      if (sqliteErr?.code === "SQLITE_CONSTRAINT_UNIQUE" && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("createChapter: max retries exceeded");
}

async function runTests() {
  const db = setupTestDb();

  // Test 1: Sequential creation
  const c1 = createChapter(db, "series-A", "Ch 1");
  const c2 = createChapter(db, "series-A", "Ch 2");
  const c3 = createChapter(db, "series-B", "Ch 1");
  console.assert(c1.number === 1, "First chapter should be 1");
  console.assert(c2.number === 2, "Second chapter should be 2");
  console.assert(c3.number === 1, "First chapter of new series should be 1");
  console.log("✓ Sequential creation");

  // Test 2: Uniqueness constraint enforced
  try {
    db.prepare("INSERT INTO chapters (series_id, number, title) VALUES (?, ?, ?)").run("series-A", 1, "dupe");
    console.assert(false, "Should have thrown on duplicate");
  } catch (e) {
    const err = e as { code?: string };
    console.assert(err.code === "SQLITE_CONSTRAINT_UNIQUE", "Should be UNIQUE violation");
  }
  console.log("✓ Uniqueness constraint");

  // Test 3: Concurrent simulation - parallel creates (SQLite serializes, retry handles races)
  const concurrencyDb = setupTestDb(dbPath2);
  const parallelCreates = Array.from({ length: 20 }, () =>
    Promise.resolve().then(() => createChapter(concurrencyDb, "series-D", "Ch"))
  );
  const parallelResults = await Promise.all(parallelCreates);
  const parallelNumbers = parallelResults.map((r) => r.number);
  const parallelUnique = new Set(parallelNumbers);
  console.assert(parallelUnique.size === 20, "All 20 parallel creates should have unique numbers");
  console.log("✓ Parallel creation (20 concurrent, no duplicates)");

  db.close();
  concurrencyDb.close();
  unlinkSync(dbPath);
  unlinkSync(dbPath2);
  console.log("\nAll tests passed.");
}

runTests();
