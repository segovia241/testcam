const express = require("express");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");
const os = require("os");
require("dotenv").config(); // Cargar variables de entorno desde .env

const app = express();

// Crear servidor HTTP
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Servidor HTTP iniciado en puerto ${process.env.PORT || 3000}`);
});

// Crear WebSocket sobre HTTP
const wss = new WebSocket.Server({ server });

// Middleware de archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Configuración del servidor Python
const PYTHON_WS_URL = process.env.PYTHON_WS_URL || "ws://localhost:8000/ws";
let pythonWebSocket = null;
let pythonConnected = false;

// Almacenar conexiones activas
const clients = new Set();

// 🔌 Conectar al WebSocket de Python
function connectToPython() {
  pythonWebSocket = new WebSocket(PYTHON_WS_URL);

  pythonWebSocket.on("open", () => {
    pythonConnected = true;
    console.log("✅ Conectado al WebSocket de Python");
  });

  pythonWebSocket.on("message", (data) => {
    try {
      const result = JSON.parse(data);
      // Reenviar resultados a todos los clientes
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(result));
        }
      });
    } catch (err) {
      console.error("Error parsing Python response:", err);
    }
  });

  pythonWebSocket.on("close", () => {
    pythonConnected = false;
    console.log("🔌 Conexión con Python cerrada. Reconectando...");
    setTimeout(connectToPython, 3000);
  });

  pythonWebSocket.on("error", (error) => {
    pythonConnected = false;
    console.error("❌ Error en conexión Python:", error.message);
  });
}

// 🧩 Manejo de conexiones WebSocket
wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`✅ Nuevo cliente conectado. Total: ${clients.size}`);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "frame") {
        // Reenviar frame al servidor Python via WebSocket
        if (pythonConnected && pythonWebSocket) {
          pythonWebSocket.send(JSON.stringify(data));
        } else {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Servidor de procesamiento no disponible",
            })
          );
        }
      }
    } catch (err) {
      console.error("Error procesando mensaje:", err);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Error procesando mensaje",
        })
      );
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`🔌 Cliente desconectado. Total: ${clients.size}`);
  });

  ws.on("error", (error) => {
    console.error("Error en WebSocket cliente:", error);
    clients.delete(ws);
  });
});

// Rutas HTTP básicas
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    clients: clients.size,
    pythonConnected: pythonConnected,
  });
});

// Manejo de errores globales
wss.on("error", (error) => {
  console.error("WebSocket server error:", error);
});

// Iniciar conexión con Python
connectToPython();

// 🧠 Obtener IP local del sistema (para usarla en Expo)
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const localIp = getLocalIp();

console.log(`📊 Health Check: http://${localIp}:${process.env.PORT || 3000}/health`);
console.log(`🔗 WebSocket URL (para Expo): ws://${localIp}:${process.env.PORT || 3000}/ws`);
console.log(`🐍 Conectando con Python WebSocket en: ${PYTHON_WS_URL}\n`);
