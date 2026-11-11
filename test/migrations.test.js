import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../lib/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures", "migrations");

let db;

const openDb = () => {
  db = new PGlite();
  return db;
};

afterEach(async () => {
  await db?.close();
  db = undefined;
});

const versions = async () => {
  const { rows } = await db.query("SELECT version FROM schema_migrations ORDER BY version");
  return rows.map((row) => row.version);
};

const tables = async () => {
  const { rows } = await db.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name`,
  );
  return rows.map((row) => row.table_name);
};

describe("migrations", () => {
  it("применяет все миграции и записывает версии", async () => {
    openDb();

    const applied = await migrate(db);

    expect(applied).toEqual(["001_create_courses", "002_create_users", "003_create_comments"]);
    expect(await versions()).toEqual(applied);
    expect(await tables()).toEqual(["comments", "courses", "schema_migrations", "users"]);
  });

  it("не применяет миграции повторно", async () => {
    openDb();
    await migrate(db);

    const applied = await migrate(db);

    expect(applied).toEqual([]);
    expect(await versions()).toHaveLength(3);
  });

  it("выполняет файлы в порядке номеров", async () => {
    openDb();

    const applied = await migrate(db, path.join(fixturesDir, "order"));

    expect(applied).toEqual(["001_parent", "002_child"]);
    expect(await tables()).toContain("order_child");
  });

  it("откатывает упавшую миграцию и не помечает её применённой", async () => {
    openDb();

    await expect(migrate(db, path.join(fixturesDir, "broken"))).rejects.toThrow(/missing_table/);

    expect(await versions()).toEqual(["001_ok"]);
    expect(await tables()).not.toContain("broken_extra");
  });

  it("создаёт в comments ограничения на текст и тип", async () => {
    openDb();
    await migrate(db);
    await db.query(
      "INSERT INTO users (name, email, password) VALUES ('a', 'a@example.com', 'secret')",
    );

    const insert = (body, type) =>
      db.query(
        `INSERT INTO comments (body, user_id, commentable_type, commentable_id)
         VALUES ($1, 1, $2, 1)`,
        [body, type],
      );

    await expect(insert("ok", "lesson")).rejects.toThrow(/violates check constraint/);
    await expect(insert("   ", "course")).rejects.toThrow(/violates check constraint/);
    await expect(insert("x".repeat(1001), "course")).rejects.toThrow(/violates check constraint/);
    await expect(insert("ok", "course")).resolves.toBeDefined();
  });
});
