const soap = require("soap");
const fs = require("node:fs");
const http = require("http");
const postgres = require("postgres");

// Configuration de la connexion PostgreSQL
const sql = postgres({
  host: "localhost",
  port: 5432,
  db: "mydb",
  user: "user",
  password: "password",
});

// Implémentation du service SOAP
const service = {
  ProductsService: {
    ProductsPort: {
      // CREATE: Ajouter un nouveau produit
      CreateProduct: async function ({ name, about, price }, callback) {
        if (!name || !about || !price) {
          return callback({
            Fault: {
              Code: { Value: "soap:Sender", Subcode: { Value: "rpc:BadArguments" } },
              Reason: { Text: "Tous les champs (name, about, price) sont requis" },
              statusCode: 400,
            },
          });
        }

        try {
          const product = await sql`
            INSERT INTO products (name, about, price)
            VALUES (${name}, ${about}, ${price})
            RETURNING *
          `;
          callback(null, { Product: product[0] });
        } catch (error) {
          console.error("Erreur lors de la création:", error);
          callback({
            Fault: {
              Code: { Value: "soap:Receiver", Subcode: { Value: "rpc:ServerError" } },
              Reason: { Text: "Erreur interne du serveur" },
              statusCode: 500,
            },
          });
        }
      },

      // READ: Récupérer tous les produits
      GetProducts: async function (args, callback) {
        try {
          const products = await sql`SELECT * FROM products`;
          callback(null, { Product: products });
        } catch (error) {
          console.error("Erreur lors de la récupération:", error);
          callback({
            Fault: {
              Code: { Value: "soap:Receiver", Subcode: { Value: "rpc:ServerError" } },
              Reason: { Text: "Erreur interne du serveur" },
              statusCode: 500,
            },
          });
        }
      },

      // UPDATE/PATCH: Mettre à jour un produit existant
      PatchProduct: async function ({ id, name, about, price }, callback) {
        if (!id || (!name && !about && !price)) {
          return callback({
            Fault: {
              Code: { Value: "soap:Sender", Subcode: { Value: "rpc:BadArguments" } },
              Reason: { Text: "ID et au moins un champ à mettre à jour sont requis" },
              statusCode: 400,
            },
          });
        }

        try {
          const updates = [];
          const values = [];

          if (name) {
            updates.push(`name = $${updates.length + 1}`);
            values.push(name);
          }
          if (about) {
            updates.push(`about = $${updates.length + 1}`);
            values.push(about);
          }
          if (price) {
            updates.push(`price = $${updates.length + 1}`);
            values.push(price);
          }

          values.push(id); // ID est le dernier paramètre
          const queryText = `UPDATE products SET ${updates.join(", ")} WHERE id = $${updates.length + 1} RETURNING *`;
          const result = await sql.unsafe(queryText, values);

          if (result.length === 0) {
            return callback({
              Fault: {
                Code: { Value: "soap:Sender", Subcode: { Value: "rpc:NotFound" } },
                Reason: { Text: "Produit non trouvé" },
                statusCode: 404,
              },
            });
          }

          callback(null, { Product: result[0] });
        } catch (error) {
          console.error("Erreur lors de la mise à jour:", error);
          callback({
            Fault: {
              Code: { Value: "soap:Receiver", Subcode: { Value: "rpc:ServerError" } },
              Reason: { Text: "Erreur interne du serveur" },
              statusCode: 500,
            },
          });
        }
      },

      // DELETE: Supprimer un produit
      DeleteProduct: async function ({ id }, callback) {
        if (!id) {
          return callback({
            Fault: {
              Code: { Value: "soap:Sender", Subcode: { Value: "rpc:BadArguments" } },
              Reason: { Text: "ID est requis" },
              statusCode: 400,
            },
          });
        }

        try {
          const result = await sql`DELETE FROM products WHERE id = ${id} RETURNING *`;
          if (result.length === 0) {
            return callback({
              Fault: {
                Code: { Value: "soap:Sender", Subcode: { Value: "rpc:NotFound" } },
                Reason: { Text: "Produit non trouvé" },
                statusCode: 404,
              },
            });
          }
          callback(null, { status: "Produit supprimé avec succès" });
        } catch (error) {
          console.error("Erreur lors de la suppression:", error);
          callback({
            Fault: {
              Code: { Value: "soap:Receiver", Subcode: { Value: "rpc:ServerError" } },
              Reason: { Text: "Erreur interne du serveur" },
              statusCode: 500,
            },
          });
        }
      },
    },
  },
};

// Création du serveur HTTP
const server = http.createServer((req, res) => {
  res.statusCode = 404;
  res.end("404: Not Found: " + req.url);
});

// Démarrage du serveur sur le port 8000
const port = 8000;
server.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});

// Chargement du fichier WSDL et démarrage du service SOAP
const xml = fs.readFileSync("productsService.wsdl", "utf8");
soap.listen(server, "/products", service, xml, () => {
  console.log("Service SOAP disponible à http://localhost:8000/products?wsdl");
});