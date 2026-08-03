import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import Database from "better-sqlite3";

const repositoryRoot = findRepositoryRoot(process.cwd());
const migrationsPath = resolve(repositoryRoot, "payment-api/migrations");

// A test-only override of the database file location. Populated either by
// PAYMENT_API_TEST_DATABASE_PATH (set before this module is first imported,
// e.g. via a `--import` preload script) or by calling
// `resetDatabaseForTests` directly from an isolated test process. Ordinary
// application startup never sets this, so production/dev behavior is
// unchanged.
let databasePathOverride: string | undefined =
  process.env.PAYMENT_API_TEST_DATABASE_PATH
    ? resolve(process.env.PAYMENT_API_TEST_DATABASE_PATH)
    : undefined;

let database: Database.Database | undefined;

export function getDatabase(
  environment: "sandbox" | "production",
): Database.Database {
  if (environment === "production") {
    throw new Error(
      "Production Plaid token storage requires encryption and is not enabled",
    );
  }

  if (database) {
    return database;
  }

  const databasePath = resolveDatabasePath();
  mkdirSync(dirname(databasePath), { mode: 0o700, recursive: true });

  const nextDatabase = new Database(databasePath);
  chmodSync(databasePath, 0o600);
  nextDatabase.pragma("foreign_keys = ON");
  nextDatabase.pragma("journal_mode = WAL");
  nextDatabase.pragma("busy_timeout = 5000");
  nextDatabase.pragma("synchronous = NORMAL");
  runMigrations(nextDatabase);
  database = nextDatabase;

  return database;
}

export function getDatabasePath(): string {
  return resolveDatabasePath();
}

/**
 * Test-only seam: point subsequent `getDatabase` calls at a fresh SQLite
 * file and drop the cached connection so migrations re-run against it. Not
 * exported from the package's public entry point. Never call this from
 * application code.
 */
export function resetDatabaseForTests(nextPath: string): void {
  if (database) {
    database.close();
    database = undefined;
  }

  databasePathOverride = resolve(nextPath);
}

function resolveDatabasePath(): string {
  return databasePathOverride ?? resolve(repositoryRoot, "data/payment-test.sqlite");
}

function runMigrations(target: Database.Database): void {
  target.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = target
    .prepare("SELECT version FROM schema_migrations")
    .all()
    .map((row) => (row as { version: string }).version);
  const appliedVersions = new Set(applied);
  const migrationFiles = readdirSync(migrationsPath)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const version = file.split("_", 1)[0];

    if (!version || appliedVersions.has(version)) {
      continue;
    }

    const sql = readFileSync(resolve(migrationsPath, file), "utf8");
    const applyMigration = target.transaction(() => {
      target.exec(sql);
      target
        .prepare(
          "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        )
        .run(version, new Date().toISOString());
    });

    applyMigration();
  }
}

function findRepositoryRoot(start: string): string {
  let candidate = resolve(start);

  while (true) {
    if (
      existsSync(resolve(candidate, "package.json")) &&
      existsSync(resolve(candidate, "payment-api/migrations"))
    ) {
      return candidate;
    }

    const parent = dirname(candidate);

    if (parent === candidate) {
      throw new Error("Unable to locate the payment-test repository root");
    }

    candidate = parent;
  }
}
