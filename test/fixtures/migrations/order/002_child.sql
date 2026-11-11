CREATE TABLE order_child (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER NOT NULL REFERENCES order_parent(id)
);
