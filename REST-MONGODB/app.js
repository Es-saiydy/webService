const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const z = require("zod");

const app = express();
const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

// Schémas Zod
const ProductSchema = z.object({
  _id: z.string(),
  name: z.string(),
  about: z.string(),
  price: z.number().positive(),
  categoryIds: z.array(z.string()),
});

const CreateProductSchema = ProductSchema.omit({ _id: true });

const CategorySchema = z.object({
  _id: z.string(),
  name: z.string(),
});

const CreateCategorySchema = CategorySchema.omit({ _id: true });

// Routes Categories
app.post("/categories", async (req, res) => {
  const result = await CreateCategorySchema.safeParse(req.body);
  if (result.success) {
    const { name } = result.data;
    try {
      const ack = await db.collection("categories").insertOne({ name });
      res.status(201).send({ _id: ack.insertedId, name });
    } catch (err) {
      res.status(500).send({ error: "Failed to create category" });
    }
  } else {
    res.status(400).send(result.error);
  }
});

app.get("/categories", async (req, res) => {
  try {
    const categories = await db.collection("categories").find({}).toArray();
    res.send(categories);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch categories" });
  }
});

app.get("/categories/:id", async (req, res) => {
  try {
    const category = await db.collection("categories").findOne({ _id: req.params.id });
    if (!category) {
      return res.status(404).send({ error: "Category not found" });
    }
    res.send(category);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch category" });
  }
});

app.put("/categories/:id", async (req, res) => {
  const result = await CreateCategorySchema.safeParse(req.body);
  if (result.success) {
    const { name } = result.data;
    try {
      const updateResult = await db.collection("categories").updateOne(
        { _id: req.params.id },
        { $set: { name } }
      );
      if (updateResult.matchedCount === 0) {
        return res.status(404).send({ error: "Category not found" });
      }
      res.send({ _id: req.params.id, name });
    } catch (err) {
      res.status(500).send({ error: "Failed to update category" });
    }
  } else {
    res.status(400).send(result.error);
  }
});

app.delete("/categories/:id", async (req, res) => {
  try {
    const deleteResult = await db.collection("categories").deleteOne({ _id: req.params.id });
    if (deleteResult.deletedCount === 0) {
      return res.status(404).send({ error: "Category not found" });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).send({ error: "Failed to delete category" });
  }
});

// Routes Products
app.post("/products", async (req, res) => {
  const result = await CreateProductSchema.safeParse(req.body);
  if (result.success) {
    const { name, about, price, categoryIds } = result.data;
    const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));
    try {
      // Vérifier si les categoryIds existent
      const categories = await db
        .collection("categories")
        .find({ _id: { $in: categoryObjectIds } })
        .toArray();
      if (categories.length !== categoryIds.length) {
        return res.status(400).send({
          error: "One or more category IDs are invalid",
        });
      }
      const ack = await db
        .collection("products")
        .insertOne({ name, about, price, categoryIds: categoryObjectIds });
      res.status(201).send({
        _id: ack.insertedId,
        name,
        about,
        price,
        categoryIds: categoryObjectIds,
      });
    } catch (err) {
      res.status(500).send({ error: "Failed to create product" });
    }
  } else {
    res.status(400).send(result.error);
  }
});

app.get("/products", async (req, res) => {
  try {
    const products = await db.collection("products").aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "categoryIds",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          about: 1,
          price: 1,
          categoryIds: 1,
          "categories._id": 1,
          "categories.name": 1,
        },
      },
    ]).toArray();
    res.send(products);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch products" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const product = await db.collection("products").aggregate([
      {
        $match: { _id: req.params.id },
      },
      {
        $lookup: {
          from: "categories",
          localField: "categoryIds",
          foreignField: "_id",
          as: "categories",
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          about: 1,
          price: 1,
          categoryIds: 1,
          "categories._id": 1,
          "categories.name": 1,
        },
      },
    ]).toArray();
    if (!product.length) {
      return res.status(404).send({ error: "Product not found" });
    }
    res.send(product[0]);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch product" });
  }
});

app.put("/products/:id", async (req, res) => {
  const result = await CreateProductSchema.safeParse(req.body);
  if (result.success) {
    const { name, about, price, categoryIds } = result.data;
    const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));
    try {
      // Vérifier si les categoryIds existent
      const categories = await db
        .collection("categories")
        .find({ _id: { $in: categoryObjectIds } })
        .toArray();
      if (categories.length !== categoryIds.length) {
        return res.status(400).send({
          error: "One or more category IDs are invalid",
        });
      }
      const updateResult = await db.collection("products").updateOne(
        { _id: req.params.id },
        { $set: { name, about, price, categoryIds: categoryObjectIds } }
      );
      if (updateResult.matchedCount === 0) {
        return res.status(404).send({ error: "Product not found" });
      }
      res.send({ _id: req.params.id, name, about, price, categoryIds: categoryObjectIds });
    } catch (err) {
      res.status(500).send({ error: "Failed to update product" });
    }
  } else {
    res.status(400).send(result.error);
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const deleteResult = await db.collection("products").deleteOne({ _id: req.params.id });
    if (deleteResult.deletedCount === 0) {
      return res.status(404).send({ error: "Product not found" });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).send({ error: "Failed to delete product" });
  }
});

// Routes de recherche
app.get("/products/search", async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).send({ error: "Name query parameter is required" });
    }
    const products = await db
      .collection("products")
      .find({ name: { $regex: name, $options: "i" } })
      .toArray();
    res.send(products);
  } catch (err) {
    res.status(500).send({ error: "Failed to search products" });
  }
});

app.get("/products/category/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const products = await db
      .collection("products")
      .find({ categoryIds: new ObjectId(categoryId) })
      .toArray();
    res.send(products);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch products by category" });
  }
});

// Connexion à MongoDB et création des indexes
client.connect().then(async () => {
  db = client.db("myDB");
  // Create index on products name
  await db.collection("products").createIndex({ name: 1 });
  // Create compound index on name and price
  await db.collection("products").createIndex({ name: 1, price: -1 });
  // Create index on categoryIds
  await db.collection("products").createIndex({ categoryIds: 1 });
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}).catch(err => {
  console.error("Failed to connect to MongoDB", err);
  process.exit(1);
});


