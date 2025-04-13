const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  console.log("a user connected");

  // Étape 3 : Réception et diffusion d'un message
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg); // Diffuse à tous les clients
  });

  // Étape 4 : Gérer la déconnexion
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
});

server.listen(3000, () => {
  console.log("listening on *:3000");
});