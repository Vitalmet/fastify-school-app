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

const courseSchema = {
  body: yup.object({
    title: yup.string().min(2),
  }),
};

export default async (app, _opts) => {
  const { db } = app;

  const findCourse = async (id) => {
    const { rows } = await db.query("SELECT * FROM courses WHERE id = $1", [id]);
    return rows[0];
  };

  // Одна страница курса и для просмотра, и для повторного показа формы после
  // ошибки: иначе сохранённые значения и свежие комментарии пришлось бы
  // собирать в двух местах.
  const renderCourse = async (req, res, course, values = {}) => {
    const comments = await listComments(db, COMMENTABLE.course, course.id);
    const users = await listAuthors(db);

    return res.view("courses/show", {
      course,
      comments,
      users,
      commentBody: values.commentBody ?? "",
      authorId: values.authorId ?? "",
      flash: res.flash(),
    });
  };

  // Просмотр списка курсов
  app.get("/courses", { name: "courses" }, async (req, res) => {
    const { title } = req.query;

    const { rows: courses } = title
      ? await db.query("SELECT * FROM courses WHERE title ILIKE $1", [`%${title}%`])
      : await db.query("SELECT * FROM courses");

    return res.view("courses/index", { courses, flash: res.flash() });
  });

  // Форма создания нового курса
  app.get("/courses/new", { name: "newCourse" }, (_req, res) => res.view("courses/new"));

  // Просмотр конкретного курса
  app.get("/courses/:id", { name: "course" }, async (req, res) => {
    const course = await findCourse(req.params.id);

    if (!course) {
      return res.code(404).send("Course not found");
    }

    return renderCourse(req, res, course);
  });

  // Создание курса
  app.post("/courses", { attachValidation: true, schema: courseSchema }, async (req, res) => {
    const { title, description } = req.body;

    if (req.validationError) {
      req.flash("warning", req.validationError.message);
      return res.view("courses/new", { title, description, flash: res.flash() });
    }

    await db.query("INSERT INTO courses (title, description) VALUES ($1, $2)", [
      title,
      description,
    ]);

    req.flash("success", "Курс успешно создан");
    return res.redirect(app.reverse("courses"));
  });

  // Форма редактирования курса
  app.get("/courses/:id/edit", { name: "editCourse" }, async (req, res) => {
    const course = await findCourse(req.params.id);

    if (!course) {
      return res.code(404).send("Course not found");
    }

    return res.view("courses/edit", { course, flash: res.flash() });
  });

  // Обновление курса
  app.patch("/courses/:id", { attachValidation: true, schema: courseSchema }, async (req, res) => {
    const { id } = req.params;
    const { title, description } = req.body;

    if (req.validationError) {
      req.flash("warning", req.validationError.message);
      return res.view("courses/edit", { course: { id, title, description }, flash: res.flash() });
    }

    await db.query("UPDATE courses SET title = $1, description = $2 WHERE id = $3", [
      title,
      description,
      id,
    ]);

    req.flash("success", "Курс успешно отредактирован");
    return res.redirect(app.reverse("courses"));
  });

  // Добавление комментария к курсу
  app.post(
    "/courses/:courseId/comments",
    { name: "courseComments", attachValidation: true, schema: commentSchema },
    async (req, res) => {
      const course = await findCourse(req.params.courseId);

      if (!course) {
        return res.code(404).send("Course not found");
      }

      const { body, authorId } = req.body ?? {};

      if (req.validationError) {
        req.flash("warning", req.validationError.message);
        return renderCourse(req, res, course, { commentBody: body, authorId });
      }

      // Синхронный валидатор yup не может сходить в базу, поэтому автора
      // проверяем отдельно: иначе несуществующий id дал бы 500 на внешнем ключе.
      if (!(await userExists(db, authorId))) {
        req.flash("warning", "Выберите автора");
        return renderCourse(req, res, course, { commentBody: body, authorId });
      }

      await createComment(db, COMMENTABLE.course, course.id, { authorId, body });

      req.flash("success", "Комментарий добавлен");
      return res.redirect(app.reverse("course", { id: course.id }));
    },
  );

  // Удаление комментария курса
  app.delete("/courses/:courseId/comments/:id", { name: "courseComment" }, async (req, res) => {
    const deleted = await deleteComment(db, COMMENTABLE.course, req.params.courseId, req.params.id);

    if (!deleted) {
      return res.code(404).send("Comment not found");
    }

    req.flash("success", "Комментарий удален");
    return res.redirect(app.reverse("course", { id: req.params.courseId }));
  });

  // Удаление курса
  app.delete("/courses/:id", async (req, res) => {
    const { id } = req.params;

    // Комментарии полиморфные, внешнего ключа нет: чистим их вместе с курсом.
    await db.transaction(async (tx) => {
      await deleteCommentsFor(tx, COMMENTABLE.course, id);
      await tx.query("DELETE FROM courses WHERE id = $1", [id]);
    });

    req.flash("success", "Курс успешно удален");
    return res.redirect(app.reverse("courses"));
  });
};
