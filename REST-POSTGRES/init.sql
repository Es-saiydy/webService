CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    about TEXT NOT NULL,
    price DECIMAL NOT NULL,
    review_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    total_score DECIMAL(3,1) DEFAULT 0.0
);

INSERT INTO products (name, about, price) VALUES
  ('My first game', 'This is an awesome game', 60),
  ('GameStar', 'Un jeu d’aventure épique', 19.99),
  ('FPS Master', 'Un shooter FPS rapide', 29.99),
  ('Puzzle Game', 'Un jeu de réflexion amusant', 9.99),
  ('Super FPS', 'Un autre jeu FPS intense', 39.99);

INSERT INTO users (username, email, password) VALUES
  ('john', 'john@example.com', 'hashedpassword');

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_ids INTEGER[], -- Pas de REFERENCES ici
    total DECIMAL(10, 2) NOT NULL,
    payment BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    score INTEGER CHECK (score >= 1 AND score <= 5),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO reviews (user_id, product_id, score, content) VALUES
  (1, 1, 4, 'Super produit !');