import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Redis } from '@upstash/redis';
import fs from 'fs';
import { startAnima } from './npc/anima.js';
import { PERSONALITIES } from './npc/personalities.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static('dist'));
app.use(express.json());

// ─── Redis (world + memory persistence) ─────────────────────────────────────
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

async function loadWorldBlocks(room) {
  try {
    const saved = await redis.get(`world:${room}:blocks`);
    if (saved) {
      const blocks = typeof saved === 'string' ? JSON.parse(saved) : saved;
      console.log(`[World] Loaded ${blocks.length} blocks for room "${room}"`);
      return blocks;
    }
  } catch (e) {
    console.log(`[World] No saved blocks for "${room}", starting fresh`);
  }
  return [];
}

async function saveWorldBlocks(room, blocks) {
  try {
    await redis.set(`world:${room}:blocks`, JSON.stringify(blocks));
  } catch (e) {
    console.log(`[World] Block save error: ${e.message}`);
  }
}

async function loadCustomWorld(room) {
  try {
    if (fs.existsSync('world_data.json')) {
      const data = fs.readFileSync('world_data.json', 'utf8');
      const allData = JSON.parse(data);
      return allData[room] || null;
    }
  } catch (e) {
    console.log(`[World] Local custom data load error: ${e.message}`);
  }
  return null;
}

async function saveCustomWorld(room, data) {
  try {
    let allData = {};
    if (fs.existsSync('world_data.json')) {
      allData = JSON.parse(fs.readFileSync('world_data.json', 'utf8'));
    }
    allData[room] = data;
    fs.writeFileSync('world_data.json', JSON.stringify(allData, null, 2));
    console.log(`[World] Saved custom map for ${room} to local world_data.json`);
  } catch (e) {
    console.log(`[World] Custom data save error: ${e.message}`);
  }
}

// ─── Game State ──────────────────────────────────────────────────────────────
const gameStates = {
  sandbox: { players: {}, blocks: [], latestTelemetry: {} },
  gta:     { players: {}, blocks: [], latestTelemetry: {} },
  shooter: { players: {}, blocks: [], latestTelemetry: {} }
};

// Load persisted blocks from Redis on startup
async function initWorldState() {
  for (const room of Object.keys(gameStates)) {
    gameStates[room].blocks = await loadWorldBlocks(room);
    gameStates[room].customData = await loadCustomWorld(room);
  }
}

// ─── Helper: get all players in a room ──────────────────────────────────────
function getPlayersInRoom(room) {
  if (!gameStates[room]) return [];
  return Object.values(gameStates[room].players);
}

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  let currentRoom = null;

  socket.on('join', (data) => {
    const { name, password, game } = data;
    const isGod = password === 'creator';

    currentRoom = game || 'sandbox';
    if (!gameStates[currentRoom]) {
      gameStates[currentRoom] = { players: {}, blocks: [], latestTelemetry: { type: 'init', data: {} } };
    }

    socket.join(currentRoom);

    // Initialize latestTelemetry with an empty object
  gameStates[currentRoom].latestTelemetry = gameStates[currentRoom]?.latestTelemetry || {};
  gameStates[currentRoom].players[socket.id] = {
      id: socket.id,
      name: name || 'Guest',
      isGod,
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }
    };

    socket.emit('init', {
      players: gameStates[currentRoom].players,
      blocks: gameStates[currentRoom].blocks,
      customData: gameStates[currentRoom].customData,
      selfId: socket.id,
      isGod
    });

    socket.to(currentRoom).emit('playerJoined', gameStates[currentRoom].players[socket.id]);
    io.to(currentRoom).emit('notification', `${name || 'Guest'} has entered the ${currentRoom} world!`);
  });

  socket.on('move', (data) => {
    if (currentRoom && gameStates[currentRoom]?.players[socket.id]) {
      gameStates[currentRoom].players[socket.id].position = data.position;
      gameStates[currentRoom].players[socket.id].rotation = data.rotation;
      socket.to(currentRoom).emit('playerMoved', gameStates[currentRoom].players[socket.id]);
    }
  });

  socket.on('telemetry', (data) => {
    if (currentRoom) gameStates[currentRoom].latestTelemetry = data;
  });

  socket.on('placeBlock', (data) => {
    const player = gameStates[currentRoom]?.players[socket.id];
    if (!currentRoom || !player?.isGod) return;

    const block = {
      id: Date.now().toString() + Math.random().toString(),
      position: data.position,
      color: 0x888888
    };
    gameStates[currentRoom].blocks.push(block);
    io.to(currentRoom).emit('blockPlaced', block);

    // Persist to Redis immediately
    saveWorldBlocks(currentRoom, gameStates[currentRoom].blocks);
  });

  socket.on('publishWorld', (data) => {
    const player = gameStates[currentRoom]?.players[socket.id];
    if (!currentRoom || !player?.isGod) return;
    
    // Save the new layout arrays to state and redis
    gameStates[data.room].customData = data.data;
    saveCustomWorld(data.room, data.data);
    
    // Broadcast the new world to everyone so their clients hot-reload the mesh matrices
    io.to(data.room).emit('worldUpdated', data.data);
  });

  socket.on('chatMessage', (data) => {
    const player = gameStates[currentRoom]?.players[socket.id];
    if (!currentRoom || !player) return;

    if (!currentRoom) {
    console.error('[API] Invalid room:', currentRoom);
    res.status(400).json({ error: 'Invalid room' });
    return;
  }

  const gameState = gameStates[currentRoom];
  if (!gameState) {
    console.error('[API] Game state not found for room:', currentRoom);
    res.status(404).json({ error: 'Game state not found' });
    return;
  }

  // Ensure latestTelemetry is initialized
  gameState.latestTelemetry = gameState.latestTelemetry || { type: 'init', data: {} };
  const text = String(data.text || '').trim().slice(0, 200);
  
  if (text) {
    socket.to(currentRoom).emit('chatMessage', {
      name: player.name,
      text,
      isGod: player.isGod,
      isNPC: false
    });
    
    // Optionally update latestTelemetry with the chat message
    if (currentRoom && gameStates[currentRoom]) {
    if (gameStates[currentRoom]) {
    gameStates[currentRoom].latestTelemetry = { type: 'chat', data: { name: player.name, text } };
  }
  }
  }
    if (!text) return;

    socket.to(currentRoom).emit('chatMessage', {
      name: player.name,
      text,
      isGod: player.isGod,
      isNPC: false
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoom && gameStates[currentRoom]?.players[socket.id]) {
      io.to(currentRoom).emit('playerLeft', socket.id);
      delete gameStates[currentRoom].players[socket.id];
    }
  });
});

// ─── API Endpoints ───────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  res.json({
    status: 'running',
    rooms: Object.fromEntries(
      Object.entries(gameStates).map(([k, v]) => [k, Object.keys(v.players).length])
    )
  });
});

app.post('/api/reload', (req, res) => {
  io.emit('forceReload');
  res.json({ success: true });
});

import Groq from 'groq-sdk';
let groqClient = null;

app.post('/api/analyze-texture', async (req, res) => {
  try {
    if (!groqClient) {
      groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    
    const { textureName, availableTags } = req.body;
    
    if (!availableTags || availableTags.length === 0) {
      return res.json({ selectedTag: null });
    }

    const systemPrompt = `You are an AI World Decorator. You map raw texture filenames to semantic object tags.
You must output ONLY valid JSON in this format: {"selectedTag": "the_tag_name"} or {"selectedTag": null} if nothing fits.
Do not write anything else.
Texture: "${textureName}"
Available Tags: [${availableTags.join(', ')}]
Which tag makes the most logical sense to apply this texture to?`;

    const completion = await groqClient.chat.completions.create({
      messages: [{ role: 'system', content: systemPrompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 30
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const match = raw.match(/\{.*?\}/s);
    if (match) {
      const parsed = JSON.parse(match[0]);
      res.json({ selectedTag: parsed.selectedTag });
    } else {
      res.json({ selectedTag: null });
    }
  } catch (e) {
    console.log(`[TextureAI] Groq Error: ${e.message}`);
    res.json({ selectedTag: null, error: e.message });
  }
});

// ─── Boot ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, async () => {
  console.log(`World server running on http://localhost:${PORT}`);

  // Load persisted world state from Redis
  await initWorldState();

  // Start Anima NPC brains (they run forever in the background)
  for (const personality of PERSONALITIES) {
    startAnima(personality, io, getPlayersInRoom)
      .catch(e => console.log(`[${personality.name}] Brain crashed: ${e.message}`));
  }

  console.log(`[Anima] ${PERSONALITIES.length} NPCs are waking up...`);
});
