import * as yup from "yup";

// Единственное место, где живут значения commentable_type: опечатка в строке
// иначе создала бы комментарий, который никто не покажет и не удалит.
export const COMMENTABLE = {
  course: "course",
  user: "user",
};

// Сообщения сразу на русском: английские дефолты yup утекали бы в интерфейс,
// потому что маршруты показывают req.validationError.message как есть.
export const commentSchema = {
  body: yup.object({
    body: yup
      .string()
      .trim()
      .required("Введите комментарий")
      .min(3, "Комментарий слишком короткий")
      .max(1000, "Комментарий слишком длинный"),
    authorId: yup
      .number()
      .typeError("Выберите автора")
      .integer()
      .positive()
      .required("Выберите автора"),
  }),
};

// Комментарии выводятся от новых к старым, автор подтягивается сразу, чтобы
// шаблон не делал запрос на каждую строку.
export async function listComments(db, type, targetId) {
  const { rows } = await db.query(
    `SELECT comments.id,
            comments.body,
            comments.created_at,
            users.name AS author_name,
            users.email AS author_email
       FROM comments
       JOIN users ON users.id = comments.user_id
      WHERE comments.commentable_type = $1
        AND comments.commentable_id = $2
      ORDER BY comments.created_at DESC, comments.id DESC`,
    [type, targetId],
  );

  return rows;
}

export async function createComment(db, type, targetId, { authorId, body }) {
  const { rows } = await db.query(
    `INSERT INTO comments (body, user_id, commentable_type, commentable_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [body, authorId, type, targetId],
  );

  return rows[0];
}

// Удаление ограничено и типом, и адресатом: чужой комментарий по чужому id
// иначе удалялся бы через URL другого курса или пользователя.
export async function deleteComment(db, type, targetId, commentId) {
  const { rows } = await db.query(
    `DELETE FROM comments
      WHERE id = $1
        AND commentable_type = $2
        AND commentable_id = $3
      RETURNING id`,
    [commentId, type, targetId],
  );

  return rows[0];
}

// Полиморфную связь нельзя закрыть внешним ключом, поэтому при удалении курса
// или пользователя его комментарии удаляются вручную, в той же транзакции.
export async function deleteCommentsFor(db, type, targetId) {
  await db.query("DELETE FROM comments WHERE commentable_type = $1 AND commentable_id = $2", [
    type,
    targetId,
  ]);
}
