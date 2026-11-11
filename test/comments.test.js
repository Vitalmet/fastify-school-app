import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, form } from "./helpers.js";

let app;

beforeEach(async () => {
  app = await buildApp();
  return () => app.close();
});

const cookiesOf = (res) => {
  const raw = res.headers["set-cookie"];
  const lines = Array.isArray(raw) ? raw : [raw];

  return lines
    .filter(Boolean)
    .map((line) => line.split(";")[0])
    .join("; ");
};

// Флеш живёт в сессии, поэтому сообщение видно только на следующем запросе
// с cookie из ответа на редирект.
const withFlash = (res, url) =>
  app.inject({ method: "GET", url, headers: { cookie: cookiesOf(res) } });

const commentCount = async () => {
  const { rows } = await app.db.query("SELECT count(*)::int AS count FROM comments");
  return rows[0].count;
};

const createComment = (url, payload) => app.inject({ method: "POST", url, ...form(payload) });

describe("comments on courses", () => {
  it("показывает форму и пустое состояние", async () => {
    const res = await app.inject({ method: "GET", url: "/courses/1" });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("Комментарии");
    expect(res.payload).toContain("Комментариев пока нет");
    expect(res.payload).toContain('name="authorId"');
    expect(res.payload).toContain('name="body"');
  });

  it("создаёт комментарий", async () => {
    const res = await createComment("/courses/1/comments", {
      body: "Отличный курс",
      authorId: "1",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/courses/1");
    expect(await commentCount()).toBe(1);

    const page = await app.inject({ method: "GET", url: "/courses/1" });
    expect(page.payload).toContain("Отличный курс");
    expect(page.payload).toContain("admin");

    const flashed = await withFlash(res, "/courses/1");
    expect(flashed.payload).toContain("Комментарий добавлен");
  });

  it("не создаёт слишком короткий комментарий и сохраняет ввод", async () => {
    const res = await createComment("/courses/1/comments", {
      body: "a",
      authorId: "1",
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("Комментарий слишком короткий");
    expect(res.payload).toContain(">a</textarea>");
    expect(await commentCount()).toBe(0);
  });

  it("не падает на несуществующем авторе", async () => {
    const res = await createComment("/courses/1/comments", {
      body: "Комментарий",
      authorId: "999",
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("Выберите автора");
    expect(await commentCount()).toBe(0);
  });

  it("отдаёт 404 при добавлении к несуществующему курсу", async () => {
    const res = await createComment("/courses/999/comments", {
      body: "Комментарий",
      authorId: "1",
    });

    expect(res.statusCode).toBe(404);
    expect(await commentCount()).toBe(0);
  });

  it("удаляет комментарий", async () => {
    await createComment("/courses/1/comments", { body: "Удалить меня", authorId: "1" });

    const { rows } = await app.db.query("SELECT id FROM comments");
    const res = await app.inject({
      method: "DELETE",
      url: `/courses/1/comments/${rows[0].id}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/courses/1");
    expect(await commentCount()).toBe(0);
  });

  it("не удаляет комментарий другого курса", async () => {
    await app.db.query(
      "INSERT INTO comments (body, user_id, commentable_type, commentable_id) VALUES ('Второй курс', 1, 'course', 2)",
    );

    const { rows } = await app.db.query("SELECT id FROM comments");
    const res = await app.inject({
      method: "DELETE",
      url: `/courses/1/comments/${rows[0].id}`,
    });

    expect(res.statusCode).toBe(404);
    expect(await commentCount()).toBe(1);
  });

  it("отдаёт 404 при удалении несуществующего комментария", async () => {
    const res = await app.inject({ method: "DELETE", url: "/courses/1/comments/999" });

    expect(res.statusCode).toBe(404);
  });

  it("экранирует html в тексте комментария", async () => {
    await createComment("/courses/1/comments", {
      body: "<script>alert(1)</script>",
      authorId: "1",
    });

    const page = await app.inject({ method: "GET", url: "/courses/1" });
    expect(page.payload).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(page.payload).not.toContain("<script>alert(1)</script>");
  });

  it("удаление курса убирает его комментарии, но не чужие", async () => {
    await app.db.query(
      "INSERT INTO comments (body, user_id, commentable_type, commentable_id) VALUES ('О курсе', 1, 'course', 1)",
    );
    await app.db.query(
      "INSERT INTO comments (body, user_id, commentable_type, commentable_id) VALUES ('О пользователе', 1, 'user', 1)",
    );

    const res = await app.inject({ method: "DELETE", url: "/courses/1" });

    expect(res.statusCode).toBe(302);
    const { rows } = await app.db.query("SELECT body FROM comments ORDER BY id");
    expect(rows.map((row) => row.body)).toEqual(["О пользователе"]);
  });
});

describe("comments on users", () => {
  it("показывает форму и пустое состояние", async () => {
    const res = await app.inject({ method: "GET", url: "/users/1" });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("Комментарии");
    expect(res.payload).toContain("Комментариев пока нет");
    expect(res.payload).toContain('name="authorId"');
  });

  it("создаёт комментарий к пользователю", async () => {
    const res = await createComment("/users/1/comments", {
      body: "Хороший студент",
      authorId: "1",
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/users/1");
    expect(await commentCount()).toBe(1);

    const page = await app.inject({ method: "GET", url: "/users/1" });
    expect(page.payload).toContain("Хороший студент");
  });

  it("удаляет комментарий к пользователю", async () => {
    await createComment("/users/1/comments", { body: "Удалить меня", authorId: "1" });

    const { rows } = await app.db.query("SELECT id FROM comments");
    const res = await app.inject({
      method: "DELETE",
      url: `/users/1/comments/${rows[0].id}`,
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/users/1");
    expect(await commentCount()).toBe(0);
  });

  it("отдаёт 404 для несуществующего пользователя", async () => {
    const created = await createComment("/users/999/comments", {
      body: "Комментарий",
      authorId: "1",
    });
    const deleted = await app.inject({ method: "DELETE", url: "/users/999/comments/1" });

    expect(created.statusCode).toBe(404);
    expect(deleted.statusCode).toBe(404);
  });
});

describe("comments and deleted users", () => {
  it("удаление пользователя убирает его комментарии и комментарии о нём", async () => {
    await app.inject({
      method: "POST",
      url: "/users",
      ...form({
        name: "bob",
        email: "bob@example.com",
        password: "secret",
        passwordConfirmation: "secret",
      }),
    });

    await app.db.query(
      "INSERT INTO comments (body, user_id, commentable_type, commentable_id) VALUES ('О курсе', 2, 'course', 1)",
    );
    await app.db.query(
      "INSERT INTO comments (body, user_id, commentable_type, commentable_id) VALUES ('О пользователе', 2, 'user', 1)",
    );
    await app.db.query(
      "INSERT INTO comments (body, user_id, commentable_type, commentable_id) VALUES ('От админа', 1, 'course', 1)",
    );

    const res = await app.inject({ method: "DELETE", url: "/users/1" });

    expect(res.statusCode).toBe(302);
    const { rows } = await app.db.query("SELECT body FROM comments ORDER BY id");
    expect(rows.map((row) => row.body)).toEqual(["О курсе"]);
  });
});
