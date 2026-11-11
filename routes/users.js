import * as yup from "yup";
import {
  COMMENTABLE,
  commentSchema,
  createComment,
  deleteComment,
  deleteCommentsFor,
  listComments,
} from "../lib/comments.js";
import { listAuthors, userExists } from "../lib/users.js";

const userSchema = {
  body: yup.object({
    name: yup.string().min(2),
    email: yup.string().email(),
    password: yup.string().min(5),
    passwordConfirmation: yup
      .string()
      .oneOf([yup.ref("password")], "Пароль и подтверждение не совпадают"),
  }),
};

export default async (app, _opts) => {
  const { db } = app;

  const findUser = async (id) => {
    const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    return rows[0];
  };

  // Одна страница пользователя и для просмотра, и для повторного показа формы
  // после ошибки: значения формы и комментарии собираются в одном месте.
  const renderUser = async (req, res, user, values = {}) => {
    const comments = await listComments(db, COMMENTABLE.user, user.id);
    const users = await listAuthors(db);

    return res.view("users/show", {
      user,
      comments,
      users,
      commentBody: values.commentBody ?? "",
      authorId: values.authorId ?? "",
      flash: res.flash(),
    });
  };

  // Просмотр списка пользователей
  app.get("/users", { name: "users" }, async (req, res) => {
    const raw = req.query.query;
    const query = typeof raw === "string" ? raw.trim() : "";

    const { rows: users } = query
      ? await db.query("SELECT * FROM users WHERE name ILIKE $1 OR email ILIKE $1", [`%${query}%`])
      : await db.query("SELECT * FROM users");

    return res.view("users/index", { users, query, flash: res.flash() });
  });

  // Форма создания нового пользователя
  app.get("/users/new", { name: "newUser" }, (_req, res) =>
    res.view("users/new", { flash: res.flash() }),
  );

  // Просмотр конкретного пользователя
  app.get("/users/:id", { name: "user" }, async (req, res) => {
    const user = await findUser(req.params.id);

    if (!user) {
      return res.code(404).send("User not found");
    }

    return renderUser(req, res, user);
  });

  // Создание пользователя
  app.post("/users", { attachValidation: true, schema: userSchema }, async (req, res) => {
    const { name, email, password } = req.body;

    if (req.validationError) {
      req.flash("warning", req.validationError.message);
      return res.view("users/new", { name, email, flash: res.flash() });
    }

    await db.query("INSERT INTO users (name, email, password) VALUES ($1, $2, $3)", [
      name,
      email,
      password,
    ]);

    req.flash("success", "Пользователь успешно создан");
    return res.redirect(app.reverse("users"));
  });

  // Форма редактирования пользователя
  app.get("/users/:id/edit", { name: "editUser" }, async (req, res) => {
    const user = await findUser(req.params.id);

    if (!user) {
      return res.code(404).send("User not found");
    }

    return res.view("users/edit", { user, flash: res.flash() });
  });

  // Обновление пользователя
  app.patch("/users/:id", { attachValidation: true, schema: userSchema }, async (req, res) => {
    const { id } = req.params;
    const { name, email, password } = req.body;

    if (req.validationError) {
      req.flash("warning", req.validationError.message);
      return res.view("users/edit", { user: { id, name, email }, flash: res.flash() });
    }

    await db.query("UPDATE users SET name = $1, email = $2, password = $3 WHERE id = $4", [
      name,
      email,
      password,
      id,
    ]);

    req.flash("success", "Пользователь успешно отредактирован");
    return res.redirect(app.reverse("users"));
  });

  // Добавление комментария к пользователю
  app.post(
    "/users/:userId/comments",
    { name: "userComments", attachValidation: true, schema: commentSchema },
    async (req, res) => {
      const user = await findUser(req.params.userId);

      if (!user) {
        return res.code(404).send("User not found");
      }

      const { body, authorId } = req.body ?? {};

      if (req.validationError) {
        req.flash("warning", req.validationError.message);
        return renderUser(req, res, user, { commentBody: body, authorId });
      }

      // Синхронный валидатор yup не может сходить в базу, поэтому автора
      // проверяем отдельно: иначе несуществующий id дал бы 500 на внешнем ключе.
      if (!(await userExists(db, authorId))) {
        req.flash("warning", "Выберите автора");
        return renderUser(req, res, user, { commentBody: body, authorId });
      }

      await createComment(db, COMMENTABLE.user, user.id, { authorId, body });

      req.flash("success", "Комментарий добавлен");
      return res.redirect(app.reverse("user", { id: user.id }));
    },
  );

  // Удаление комментария пользователя
  app.delete("/users/:userId/comments/:id", { name: "userComment" }, async (req, res) => {
    const deleted = await deleteComment(db, COMMENTABLE.user, req.params.userId, req.params.id);

    if (!deleted) {
      return res.code(404).send("Comment not found");
    }

    req.flash("success", "Комментарий удален");
    return res.redirect(app.reverse("user", { id: req.params.userId }));
  });

  // Удаление пользователя
  app.delete("/users/:id", async (req, res) => {
    const { id } = req.params;

    // Комментарии о пользователе чистим вручную (полиморфная связь), а
    // комментарии, где он автор, удалит ON DELETE CASCADE на comments.user_id.
    await db.transaction(async (tx) => {
      await deleteCommentsFor(tx, COMMENTABLE.user, id);
      await tx.query("DELETE FROM users WHERE id = $1", [id]);
    });

    req.flash("success", "Пользователь успешно удален");
    return res.redirect(app.reverse("users"));
  });
};
