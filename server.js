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

// Game state per room
const gameStates = {
  sandbox: { players: {}, blocks: [], latestTelemetry: {} },
  gta: { players: {}, blocks: [], latestTelemetry: {} },
  shooter: { players: {}, blocks: [], latestTelemetry: {} }
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  let currentRoom = null;

  // Handle player login and joining a game room
  socket.on('join', (data) => {
    const { name, password, game } = data;
    const isGod = password === 'creator'; // Simple hardcoded God password
    
    currentRoom = game || 'sandbox';
    if (!gameStates[currentRoom]) {
      gameStates[currentRoom] = { players: {}, blocks: [], latestTelemetry: {} };
    }
    
    socket.join(currentRoom);

    gameStates[currentRoom].players[socket.id] = {
      id: socket.id,
      name: name || 'Guest',
      isGod: isGod,
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    };

    // Send the current room's world state to the new player
    socket.emit('init', {
      players: gameStates[currentRoom].players,
      blocks: gameStates[currentRoom].blocks,
      selfId: socket.id,
      isGod: isGod
    });

    // Notify others in the room that someone joined
    socket.to(currentRoom).emit('playerJoined', gameStates[currentRoom].players[socket.id]);
    
    // Broadcast a server notification only to that room
    io.to(currentRoom).emit('notification', `${gameStates[currentRoom].players[socket.id].name} has joined the ${currentRoom} world!`);
  });

  // Handle movement
  socket.on('move', (data) => {
    if (currentRoom && gameStates[currentRoom].players[socket.id]) {
      gameStates[currentRoom].players[socket.id].position = data.position;
      gameStates[currentRoom].players[socket.id].rotation = data.rotation;
      // Send the movement to everyone else in the room
      socket.to(currentRoom).emit('playerMoved', gameStates[currentRoom].players[socket.id]);
    }
  });

  // Handle telemetry from main.js
  socket.on('telemetry', (data) => {
    if (currentRoom) {
      gameStates[currentRoom].latestTelemetry = data;
    }
  });

  // Handle building (God Power)
  socket.on('placeBlock', (data) => {
    if (currentRoom && gameStates[currentRoom].players[socket.id] && gameStates[currentRoom].players[socket.id].isGod) {
      const block = {
        id: Date.now().toString() + Math.random().toString(),
        position: data.position,
        color: 0x888888 // Default block color for now
      };
      gameStates[currentRoom].blocks.push(block);
      io.to(currentRoom).emit('blockPlaced', block);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoom && gameStates[currentRoom].players[socket.id]) {
      io.to(currentRoom).emit('playerLeft', socket.id);
      delete gameStates[currentRoom].players[socket.id];
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
