import { PGlite } from "@electric-sql/pglite";
import fp from "fastify-plugin";
import { migrate } from "../lib/migrate.js";

// Сиды демо-данных. Проверка на пустоту делает запуск идемпотентным: это не
// важно для in-memory базы, но понадобится, если появится каталог данных.
const seed = async (db) => {
  const { rows: courseCount } = await db.query("SELECT count(*)::int AS count FROM courses");

  if (courseCount[0].count === 0) {
    const courses = [
      { title: "JavaScript", description: "Курс по языку программирования JavaScript" },
      { title: "Fastify", description: "Курс по фреймворку Fastify" },
    ];

    for (const course of courses) {
      await db.query("INSERT INTO courses (title, description) VALUES ($1, $2)", [
        course.title,
        course.description,
      ]);
    }
  }

  const { rows: userCount } = await db.query("SELECT count(*)::int AS count FROM users");

  if (userCount[0].count === 0) {
    const users = [{ name: "admin", email: "admin@example.com", password: "admin" }];

    for (const user of users) {
      await db.query("INSERT INTO users (name, email, password) VALUES ($1, $2, $3)", [
        user.name,
        user.email,
        user.password,
      ]);
    }
  }
};

// База это PostgreSQL, но поднимается она внутри процесса: PGlite это тот же
// postgres, собранный в WebAssembly. Демо запускается одной командой и при этом
// говорит с той же СУБД, что курс и учебные проекты.
//
// Схему создают SQL-файлы из migrations, их применяет lib/migrate.js. База
// in-memory, поэтому миграции прогоняются при каждом старте: отдельной команды
// migrate нет, новый процесс всё равно начинает с пустой базы.
//
// Обёртка fastify-plugin обязательна: без неё всё, что плагин добавляет в
// приложение, остаётся внутри самого плагина и до обработчиков не доходит.
export default fp(async (fastify) => {
  const db = new PGlite();

  await migrate(db);
  await seed(db);

  fastify.decorate("db", db);
  fastify.addHook("onClose", () => db.close());
});
