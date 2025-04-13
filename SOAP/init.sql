CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    about TEXT NOT NULL,
    price DECIMAL NOT NULL
);
INSERT INTO products (name, about, price) VALUES
  ('My first game', 'This is an awesome game', '60')
	
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  email TEXT NOT NULL
);
