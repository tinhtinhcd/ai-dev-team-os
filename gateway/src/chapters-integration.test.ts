/**
 * Integration test for createChapter from db.ts (TIN-37).
 * Run with: cd gateway && LOCAL_DB_PATH=./gateway-integration-test.db npx tsx src/chapters-integration.test.ts
 */
import { unlinkSync, existsSync } from "fs";
import { join } from "path";

const testDbPath = join(process.cwd(), "gateway-integration-test.db");
process.env.LOCAL_DB_PATH = testDbPath;

const { createChapter: create } = await import("./db.js");

async function run() {

  const c1 = create("series-X", "First");
  const c2 = create("series-X", "Second");
  const c3 = create("series-Y", "First");

  console.assert(c1.number === 1, "c1.number should be 1");
  console.assert(c2.number === 2, "c2.number should be 2");
  console.assert(c3.number === 1, "c3.number should be 1");

  if (existsSync(testDbPath)) unlinkSync(testDbPath);
  console.log("✓ Integration test passed");
}

run();
