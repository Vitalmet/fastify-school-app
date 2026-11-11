-- Комментарии полиморфные: commentable_type + commentable_id указывают на
-- курс или пользователя. Внешний ключ на такую пару Postgres не умеет,
-- поэтому ссылочную целостность держит приложение (lib/comments.js).
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commentable_type VARCHAR(16) NOT NULL CHECK (commentable_type IN ('course', 'user')),
  commentable_id INTEGER NOT NULL CHECK (commentable_id > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comments_target_idx ON comments (commentable_type, commentable_id, created_at DESC);
CREATE INDEX comments_user_idx ON comments (user_id);
