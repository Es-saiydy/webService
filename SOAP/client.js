const soap = require("soap");

// URL du WSDL
const url = "http://localhost:8000/products?wsdl";

// Création du client SOAP
soap.createClient(url, (err, client) => {
  if (err) {
    console.error("Erreur lors de la création du client SOAP:", err);
    return;
  }

  console.log("Client SOAP créé avec succès");

  // CREATE: Ajouter un produit
  client.CreateProduct(
    { name: "Laptop", about: "Ordinateur portable", price: 999.99 },
    (err, result) => {
      if (err) {
        console.error("Erreur lors de la création:", err.body);
        return;
      }
      console.log("Produit créé:", result.Product);

      // Récupérer l'ID du produit créé pour les opérations suivantes
      const createdProductId = result.Product.id;

      // PATCH/UPDATE: Mettre à jour le produit nouvellement créé
      client.PatchProduct(
        { id: createdProductId, name: "Laptop Pro", price: 1299.99 },
        (err, result) => {
          if (err) {
            console.error("Erreur lors de la mise à jour:", err.body);
            return;
          }
          console.log("Produit mis à jour:", result.Product);

          // DELETE: Supprimer le produit nouvellement créé
          client.DeleteProduct({ id: createdProductId }, (err, result) => {
            if (err) {
              console.error("Erreur lors de la suppression:", err.body);
              return;
            }
            console.log("Résultat de la suppression:", result.status);
          });
        }
      );
    }
  );

  // READ: Récupérer tous les produits
  client.GetProducts({}, (err, result) => {
    if (err) {
      console.error("Erreur lors de la récupération:", err.body);
      return;
    }
    console.log("Liste des produits:", result.Product);
  });
});