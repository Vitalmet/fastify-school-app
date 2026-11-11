import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const defaultMigrationsDir = path.join(__dirname, "..", "migrations");

// Имя файла задаёт и версию, и порядок: 001_create_courses.sql → 001_create_courses.
const migrationFilePattern = /^\d{3}_[a-z0-9_]+\.sql$/;

// Применяет миграции по одной в транзакции и ведёт реестр в schema_migrations.
// Версия — имя файла без расширения, поэтому применённые файлы не правятся:
// изменения оформляются новым файлом с большим номером.
export async function migrate(db, dir = defaultMigrationsDir) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await db.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.version));

  const files = (await readdir(dir)).filter((file) => migrationFilePattern.test(file)).sort();
  const appliedNow = [];

  for (const file of files) {
    const version = file.slice(0, -".sql".length);
    if (applied.has(version)) {
      continue;
    }

    const sql = await readFile(path.join(dir, file), "utf8");

    // Транзакция на файл: упавшая миграция не оставляет полутаблиц и не
    // попадает в реестр, поэтому её можно просто починить и запустить снова.
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
    });

    appliedNow.push(version);
  }

  return appliedNow;
}
