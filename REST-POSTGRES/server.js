const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const fetch = require("node-fetch");
const crypto = require("crypto");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const app = express();
const port = 8000;

// Configuration de PostgreSQL
const sql = postgres({ db: "mydb", user: "user", password: "password", port: 5433 });

// Middleware pour analyser le corps des requêtes en JSON
app.use(express.json());

// Charger la spécification Swagger
const swaggerDocument = YAML.load("./swagger.yaml");

// Servir Swagger UI sur /api-docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Définition du schéma de validation des produits avec Zod
const ProductSchema = z.object({
  id: z.number(), // ID comme entier pour correspondre à la DB
  name: z.string().min(3, "Le nom du produit doit contenir au moins 3 caractères"),
  about: z.string().min(10, "La description du produit doit contenir au moins 10 caractères"),
  price: z.number().positive("Le prix doit être un nombre positif"),
  review_ids: z.array(z.number()).optional(),
  total_score: z.number().optional(),
});

// Schéma pour la requête POST sans l'id (création d'un produit)
const CreateProductSchema = ProductSchema.omit({ id: true, review_ids: true, total_score: true });

// Route d'accueil
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Route pour récupérer tous les produits avec filtres et pagination
app.get("/products", async (req, res) => {
  const { page = 1, limit = 10, name, about, price } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Construire les conditions SQL dynamiquement
    let conditions = [];
    let values = [];

    // Filtre sur le nom (recherche partielle insensible à la casse)
    if (name) {
      conditions.push(`LOWER(name) LIKE LOWER($${values.length + 1})`);
      values.push(`%${name}%`);
    }

    // Filtre sur la description (recherche partielle insensible à la casse)
    if (about) {
      conditions.push(`LOWER(about) LIKE LOWER($${values.length + 1})`);
      values.push(`%${about}%`);
    }

    // Filtre sur le prix (inférieur ou égal)
    if (price) {
      const priceValue = parseFloat(price);
      if (!isNaN(priceValue)) {
        conditions.push(`price <= $${values.length + 1}`);
        values.push(priceValue);
      }
    }

    // Construire la requête SQL complète
    let queryString = `SELECT * FROM products`;
    if (conditions.length > 0) {
      queryString += ` WHERE ${conditions.join(" AND ")}`;
    }
    queryString += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    // Exécuter la requête
    const products = await sql.unsafe(queryString, values);

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des produits", error: error.message });
  }
});

// Route pour récupérer un produit par ID
app.get("/products/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const product = await sql`
      SELECT * FROM products WHERE id = ${id}
    `;

    if (product.length === 0) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    res.json(product[0]);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération du produit", error: error.message });
  }
});

// Route pour créer un produit (POST)
app.post("/products", async (req, res) => {
  const result = CreateProductSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json(result.error.errors);
  }

  const { name, about, price } = result.data;

  try {
    const product = await sql`
      INSERT INTO products (name, about, price, review_ids, total_score)
      VALUES (${name}, ${about}, ${price}, '{}', 0)
      RETURNING *
    `;

    res.status(201).json(product[0]);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de l'insertion du produit", error: error.message });
  }
});

// Route pour supprimer un produit par ID (DELETE)
app.delete("/products/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const productToDelete = await sql`
      SELECT * FROM products WHERE id = ${id}
    `;

    if (productToDelete.length === 0) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    await sql`
      DELETE FROM products WHERE id = ${id}
    `;

    res.json({ message: "Produit supprimé avec succès", product: productToDelete[0] });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression du produit", error: error.message });
  }
});

// Schéma Zod pour la validation des utilisateurs
const UserSchema = z.object({
  id: z.number().optional(),
  username: z.string().min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères"),
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

const CreateUserSchema = UserSchema.omit({ id: true });
const UpdateUserSchema = UserSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: "Au moins un champ doit être fourni pour la mise à jour",
});

// Fonction pour hacher le mot de passe
const hashPassword = (password) => {
  return crypto.createHash("sha512").update(password).digest("hex");
};

// Route POST pour créer un utilisateur
app.post("/users", async (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json(result.error.errors);
  }

  const { username, password, email } = result.data;

  try {
    const hashedPassword = hashPassword(password);
    const user = await sql`
      INSERT INTO users (username, password, email)
      VALUES (${username}, ${hashedPassword}, ${email})
      RETURNING id, username, email
    `;

    res.status(201).json(user[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Le nom d'utilisateur ou l'email existe déjà" });
    }
    res.status(500).json({ message: "Erreur lors de la création de l'utilisateur", error: error.message });
  }
});

// Route PUT pour mise à jour complète
app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  const result = CreateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json(result.error.errors);
  }

  const { username, password, email } = result.data;

  try {
    const hashedPassword = hashPassword(password);
    const user = await sql`
      UPDATE users 
      SET username = ${username},
          password = ${hashedPassword},
          email = ${email}
      WHERE id = ${id}
      RETURNING id, username, email
    `;

    if (user.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json(user[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Le nom d'utilisateur ou l'email existe déjà" });
    }
    res.status(500).json({ message: "Erreur lors de la mise à jour", error: error.message });
  }
});

// Route PATCH pour mise à jour partielle
app.patch("/users/:id", async (req, res) => {
  const { id } = req.params;
  const result = UpdateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json(result.error.errors);
  }

  const updates = result.data;
  if (updates.password) {
    updates.password = hashPassword(updates.password);
  }

  try {
    const user = await sql`
      UPDATE users 
      SET ${sql(updates)}
      WHERE id = ${id}
      RETURNING id, username, email
    `;

    if (user.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json(user[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Le nom d'utilisateur ou l'email existe déjà" });
    }
    res.status(500).json({ message: "Erreur lors de la mise à jour", error: error.message });
  }
});

// Route DELETE pour supprimer un utilisateur spécifique par ID
app.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const user = await sql`
      DELETE FROM users 
      WHERE id = ${id}
      RETURNING id, username, email
    `;

    if (user.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json({ message: "Utilisateur supprimé avec succès", user: user[0] });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression", error: error.message });
  }
});

// Route GET pour récupérer tous les utilisateurs avec pagination
app.get("/users", async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const users = await sql`
      SELECT id, username, email FROM users
      LIMIT ${limit} OFFSET ${offset}
    `;

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des utilisateurs", error: error.message });
  }
});

// Routes pour Free-to-Play Games
app.get("/f2p-games", async (req, res) => {
  try {
    const response = await fetch("https://www.freetogame.com/api/games");
    if (!response.ok) {
      throw new Error(`Erreur HTTP : ${response.status}`);
    }
    const games = await response.json();
    res.json(games);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des jeux Free-to-Play", error: error.message });
  }
});

app.get("/f2p-games/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const response = await fetch(`https://www.freetogame.com/api/game?id=${id}`);
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ message: "Jeu non trouvé" });
      }
      throw new Error(`Erreur HTTP : ${response.status}`);
    }
    const game = await response.json();
    res.json(game);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération du jeu", error: error.message });
  }
});

// Schéma Zod pour la validation des commandes
const OrderSchema = z.object({
  userId: z.number().int().positive("L'ID de l'utilisateur doit être un entier positif"),
  productIds: z.array(z.number().int().positive("Les IDs des produits doivent être des entiers positifs")),
  total: z.number().positive("Le total doit être un nombre positif"),
  payment: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const CreateOrderSchema = OrderSchema.omit({ createdAt: true, updatedAt: true });

// Route POST pour créer une commande
app.post("/orders", async (req, res) => {
  const result = CreateOrderSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json(result.error.errors);
  }

  const { userId, productIds } = result.data;

  try {
    const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
    if (user.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const products = await sql`SELECT * FROM products WHERE id = ANY(${productIds})`;
    if (products.length !== productIds.length) {
      return res.status(400).json({ message: "Certains produits n'existent pas" });
    }

    const totalPrice = products.reduce((sum, product) => sum + product.price, 0) * 1.2;

    const order = await sql`
      INSERT INTO orders (user_id, product_ids, total, payment)
      VALUES (${userId}, ${productIds}, ${totalPrice}, FALSE)
      RETURNING *
    `;

    res.status(201).json(order[0]);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la création de la commande", error: error.message });
  }
});

// Route GET pour récupérer toutes les commandes avec pagination
app.get("/orders", async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const orders = await sql`
      SELECT * FROM orders
      LIMIT ${limit} OFFSET ${offset}
    `;

    const detailedOrders = await Promise.all(
      orders.map(async (order) => {
        const user = await sql`SELECT id, username, email FROM users WHERE id = ${order.user_id}`;
        const products = await sql`SELECT * FROM products WHERE id = ANY(${order.product_ids})`;
        return {
          ...order,
          user: user[0],
          products,
        };
      })
    );

    res.json(detailedOrders);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des commandes", error: error.message });
  }
});

// Route GET pour récupérer une commande par ID
app.get("/orders/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const order = await sql`SELECT * FROM orders WHERE id = ${id}`;
    if (order.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée" });
    }

    const user = await sql`SELECT id, username, email FROM users WHERE id = ${order[0].user_id}`;
    const products = await sql`SELECT * FROM products WHERE id = ANY(${order[0].product_ids})`;

    const detailedOrder = {
      ...order[0],
      user: user[0],
      products,
    };

    res.json(detailedOrder);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération de la commande", error: error.message });
  }
});

// Route PUT pour mettre à jour une commande
app.put("/orders/:id", async (req, res) => {
  const { id } = req.params;
  const result = CreateOrderSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json(result.error.errors);
  }

  const { userId, productIds, total, payment } = result.data;

  try {
    const order = await sql`
      UPDATE orders
      SET user_id = ${userId}, product_ids = ${productIds}, total = ${total}, payment = ${payment}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    if (order.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée" });
    }

    res.json(order[0]);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la mise à jour de la commande", error: error.message });
  }
});

// Route DELETE pour supprimer une commande
app.delete("/orders/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const order = await sql`
      DELETE FROM orders WHERE id = ${id}
      RETURNING *
    `;

    if (order.length === 0) {
      return res.status(404).json({ message: "Commande non trouvée" });
    }

    res.json({ message: "Commande supprimée avec succès", order: order[0] });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression de la commande", error: error.message });
  }
});

// Schéma Zod pour la validation des avis
const ReviewSchema = z.object({
  userId: z.number().int().positive("L'ID de l'utilisateur doit être un entier positif"),
  productId: z.number().int().positive("L'ID du produit doit être un entier positif"),
  score: z.number().int().min(1, "Le score doit être au moins 1").max(5, "Le score ne peut pas dépasser 5"),
  content: z.string().min(1, "Le contenu de l'avis ne peut pas être vide"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const CreateReviewSchema = ReviewSchema.omit({ createdAt: true, updatedAt: true });

// POST /reviews - Créer un avis
app.post("/reviews", async (req, res) => {
  const result = CreateReviewSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json(result.error.errors);
  }

  const { userId, productId, score, content } = result.data;

  try {
    const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
    if (user.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    const product = await sql`SELECT * FROM products WHERE id = ${productId}`;
    if (product.length === 0) {
      return res.status(404).json({ message: "Produit non trouvé" });
    }

    const review = await sql`
      INSERT INTO reviews (user_id, product_id, score, content)
      VALUES (${userId}, ${productId}, ${score}, ${content})
      RETURNING *
    `;

    const reviews = await sql`SELECT score FROM reviews WHERE product_id = ${productId}`;
    const totalScore = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;

    await sql`
      UPDATE products
      SET review_ids = array_append(review_ids, ${review[0].id}),
          total_score = ${totalScore}
      WHERE id = ${productId}
    `;

    res.status(201).json(review[0]);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la création de l'avis", error: error.message });
  }
});

// GET /reviews - Récupérer tous les avis avec pagination
app.get("/reviews", async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const reviews = await sql`
      SELECT * FROM reviews
      LIMIT ${limit} OFFSET ${offset}
    `;
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des avis", error: error.message });
  }
});

// GET /reviews/:id - Récupérer un avis spécifique
app.get("/reviews/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const review = await sql`SELECT * FROM reviews WHERE id = ${id}`;
    if (review.length === 0) {
      return res.status(404).json({ message: "Avis non trouvé" });
    }
    res.json(review[0]);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération de l'avis", error: error.message });
  }
});

// PUT /reviews/:id - Mettre à jour un avis
app.put("/reviews/:id", async (req, res) => {
  const { id } = req.params;
  const result = CreateReviewSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json(result.error.errors);
  }

  const { userId, productId, score, content } = result.data;

  try {
    const existingReview = await sql`SELECT * FROM reviews WHERE id = ${id}`;
    if (existingReview.length === 0) {
      return res.status(404).json({ message: "Avis non trouvé" });
    }

    const review = await sql`
      UPDATE reviews
      SET user_id = ${userId}, product_id = ${productId}, score = ${score}, content = ${content}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `;

    const reviews = await sql`SELECT score FROM reviews WHERE product_id = ${productId}`;
    const totalScore = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;

    await sql`
      UPDATE products
      SET total_score = ${totalScore}
      WHERE id = ${productId}
    `;

    res.json(review[0]);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la mise à jour de l'avis", error: error.message });
  }
});

// DELETE /reviews/:id - Supprimer un avis
app.delete("/reviews/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const review = await sql`
      DELETE FROM reviews WHERE id = ${id}
      RETURNING *
    `;
    if (review.length === 0) {
      return res.status(404).json({ message: "Avis non trouvé" });
    }

    const productId = review[0].product_id;
    const reviews = await sql`SELECT score FROM reviews WHERE product_id = ${productId}`;
    const totalScore = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length : 0;

    await sql`
      UPDATE products
      SET review_ids = array_remove(review_ids, ${id}),
          total_score = ${totalScore}
      WHERE id = ${productId}
    `;

    res.json({ message: "Avis supprimé avec succès", review: review[0] });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression de l'avis", error: error.message });
  }
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
  console.log(`Swagger UI available at http://localhost:${port}/api-docs`);
});