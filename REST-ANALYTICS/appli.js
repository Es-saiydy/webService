const express = require("express");
const { MongoClient } = require("mongodb");
const z = require("zod");

const app = express();
const port = 8001; // Port différent pour éviter conflit avec REST-MONGODB
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

// Schémas Zod
const ViewSchema = z.object({
  _id: z.string(),
  source: z.string(),
  url: z.string(),
  visitor: z.string(),
  createdAt: z.coerce.date(),
  meta: z.record(z.any()).optional(),
});

const CreateViewSchema = ViewSchema.omit({ _id: true });

const ActionSchema = z.object({
  _id: z.string(),
  source: z.string(),
  url: z.string(),
  action: z.string(),
  visitor: z.string(),
  createdAt: z.coerce.date(),
  meta: z.record(z.any()).optional(),
});

const CreateActionSchema = ActionSchema.omit({ _id: true });

const GoalSchema = z.object({
  _id: z.string(),
  source: z.string(),
  url: z.string(),
  goal: z.string(),
  visitor: z.string(),
  createdAt: z.coerce.date(),
  meta: z.record(z.any()).optional(),
});

const CreateGoalSchema = GoalSchema.omit({ _id: true });

// Routes Views
app.post("/views", async (req, res) => {
  const result = await CreateViewSchema.safeParse(req.body);
  if (result.success) {
    const { source, url, visitor, createdAt, meta } = result.data;
    try {
      const ack = await db.collection("views").insertOne({ source, url, visitor, createdAt, meta });
      res.status(201).send({ _id: ack.insertedId, source, url, visitor, createdAt, meta });
    } catch (err) {
      res.status(500).send({ error: "Failed to create view" });
    }
  } else {
    res.status(400).send(result.error);
  }
});

app.get("/views", async (req, res) => {
  try {
    const views = await db.collection("views").find({}).toArray();
    res.send(views);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch views" });
  }
});

app.get("/views/:id", async (req, res) => {
  try {
    const view = await db.collection("views").findOne({ _id: req.params.id });
    if (!view) {
      return res.status(404).send({ error: "View not found" });
    }
    res.send(view);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch view" });
  }
});

app.put("/views/:id", async (req, res) => {
  const result = await CreateViewSchema.safeParse(req.body);
  if (result.success) {
    const { source, url, visitor, createdAt, meta } = result.data;
    try {
      const updateResult = await db.collection("views").updateOne(
        { _id: req.params.id },
        { $set: { source, url, visitor, createdAt, meta } }
      );
      if (updateResult.matchedCount === 0) {
        return res.status(404).send({ error: "View not found" });
      }
      res.send({ _id: req.params.id, source, url, visitor, createdAt, meta });
    } catch (err) {
      res.status(500).send({ error: "Failed to update view" });
    }
  } else {
    res.status(400).send(result.error);
  }
});

app.delete("/views/:id", async (req, res) => {
  try {
    const deleteResult = await db.collection("views").deleteOne({ _id: req.params.id });
    if (deleteResult.deletedCount === 0) {
      return res.status(404).send({ error: "View not found" });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).send({ error: "Failed to delete view" });
  }
});

// Routes Actions
app.post("/actions", async (req, res) => {
  const result = await CreateActionSchema.safeParse(req.body);
  if (result.success) {
    const { source, url, action, visitor, createdAt, meta } = result.data;
    try {
      const ack = await db.collection("actions").insertOne({ source, url, action, visitor, createdAt, meta });
      res.status(201).send({ _id: ack.insertedId, source, url, action, visitor, createdAt, meta });
    } catch (err) {
      res.status(500).send({ error: "Failed to create action" });
    }
  } else {
    res.status(400).send(result.error);
  }
});

app.get("/actions", async (req, res) => {
  try {
    const actions = await db.collection("actions").find({}).toArray();
    res.send(actions);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch actions" });
  }
});

// Routes Goals
app.post("/goals", async (req, res) => {
  const result = await CreateGoalSchema.safeParse(req.body);
  if (result.success) {
    const { source, url, goal, visitor, createdAt, meta } = result.data;
    try {
      const ack = await db.collection("goals").insertOne({ source, url, goal, visitor, createdAt, meta });
      res.status(201).send({ _id: ack.insertedId, source, url, goal, visitor, createdAt, meta });
    } catch (err) {
      res.status(500).send({ error: "Failed to create goal" });
    }
  } else {
    res.status(400).send(result.error);
  }
});

app.get("/goals", async (req, res) => {
  try {
    const goals = await db.collection("goals").find({}).toArray();
    res.send(goals);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch goals" });
  }
});

app.get("/goals/:goalId/details", async (req, res) => {
  try {
    // Trouver le Goal par ID
    const goal = await db.collection("goals").findOne({ _id: req.params.goalId });
    if (!goal) {
      return res.status(404).send({ error: "Goal not found" });
    }

    // Récupérer les Views et Actions associées au même visitor
    const visitor = goal.visitor;

    // Agrégation pour Views
    const views = await db.collection("views").find({ visitor }).toArray();

    // Agrégation pour Actions
    const actions = await db.collection("actions").find({ visitor }).toArray();

    // Retourner le résultat
    res.send({
      goal,
      views,
      actions,
    });
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch goal details" });
  }
});

// Connexion à MongoDB
client.connect().then(() => {
  db = client.db("analyticsDB");
  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}).catch(err => {
  console.error("Failed to connect to MongoDB", err);
  process.exit(1);
});