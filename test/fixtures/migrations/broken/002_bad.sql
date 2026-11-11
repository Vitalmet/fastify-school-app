CREATE TABLE broken_extra (
  id SERIAL PRIMARY KEY
);

INSERT INTO missing_table (id) VALUES (1);
