// Пользователи нужны не только своему разделу, но и комментариям: автор
// выбирается из списка, а его существование проверяется до вставки, иначе
// нарушение внешнего ключа превратилось бы в 500.
export async function listAuthors(db) {
  const { rows } = await db.query("SELECT id, name FROM users ORDER BY name, id");
  return rows;
}

export async function userExists(db, userId) {
  const { rows } = await db.query("SELECT 1 FROM users WHERE id = $1", [userId]);
  return rows.length > 0;
}
