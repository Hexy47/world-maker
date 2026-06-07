import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the 'dist' directory when we build the frontend
app.use(express.static('dist'));
app.use(express.json());

// Game state
let latestTelemetry = {};
const players = {}; // { id: { id, name, isGod, position: {x,y,z}, rotation: {x,y,z} } }
const blocks = []; // { id, position: {x,y,z}, color }

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle player login
  socket.on('join', (data) => {
    const { name, password } = data;
    const isGod = password === 'creator'; // Simple hardcoded God password

    players[socket.id] = {
      id: socket.id,
      name: name || 'Guest',
      isGod: isGod,
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    };

    // Send the current world state to the new player
    socket.emit('init', {
      players: players,
      blocks: blocks,
      selfId: socket.id,
      isGod: isGod
    });

    // Notify others that someone joined
    socket.broadcast.emit('playerJoined', players[socket.id]);
    
    // Broadcast a server notification
    io.emit('notification', `${players[socket.id].name} has joined the world!`);
  });

  // Handle movement
  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].position = data.position;
      players[socket.id].rotation = data.rotation;
      // Send the movement to everyone else
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  // Handle telemetry from main.js
  socket.on('telemetry', (data) => {
    latestTelemetry = data;
  });

  // Handle building (God Power)
  socket.on('placeBlock', (data) => {
    if (players[socket.id] && players[socket.id].isGod) {
      const block = {
        id: Date.now().toString() + Math.random().toString(),
        position: data.position,
        color: 0x888888 // Default block color for now
      };
      blocks.push(block);
      io.emit('blockPlaced', block);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (players[socket.id]) {
      io.emit('playerLeft', socket.id);
      delete players[socket.id];
    }
  });
});

// Add a status endpoint to check if the server is running
app.get('/status', (req, res) => {
  res.send('Server is running!');
});

// AI Launcher Endpoints
app.post('/api/reload', (req, res) => {
  io.emit('forceReload');
  res.send({ success: true });
});

app.get('/api/telemetry', (req, res) => {
  res.json(latestTelemetry);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`World server running on http://localhost:${PORT}`);
});
