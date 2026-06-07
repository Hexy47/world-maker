/**
 * Anima.js — NPC Brain System
 * A lightweight JS port of the InfinityEngine / VisualScript system.
 * Each Anima runs an async brain loop: Observe → Think (Groq AI) → Act → Remember (Redis)
 */

import { Redis } from '@upstash/redis';
import Groq from 'groq-sdk';

// Lazy-init clients so the module loads even if env vars aren't set yet
let redis = null;
let groq = null;

function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    });
  }
  return redis;
}

function getGroq() {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

// ─── ACTION: Wait ────────────────────────────────────────────────────────────
async function actionWait(minMs = 8000, maxMs = 18000) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  await new Promise(r => setTimeout(r, ms));
}

// ─── ACTION: Think (calls Groq AI) ───────────────────────────────────────────
async function actionThink(npc, context) {
  const systemPrompt = `You are ${npc.name}, ${npc.personality}.
You live in a dark, rainy neon cyberpunk city.
Keep all responses under 18 words and natural.
Always respond with ONLY valid JSON in one of these formats:
{"action":"speak","message":"your words"}
{"action":"wander"}
{"action":"watch"}`;

  const userPrompt = `Situation: ${context}`;

  try {
    const completion = await getGroq().chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.85,
      max_tokens: 80
    });

    const raw = completion.choices[0]?.message?.content || '{"action":"watch"}';
    const jsonMatch = raw.match(/\{.*?\}/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.log(`[${npc.name}] Think error: ${e.message}`);
  }

  return { action: 'wander' };
}

// ─── ACTION: Wander (moves NPC to a random nearby spot) ──────────────────────
function actionWander(npc) {
  const range = 40;
  npc.position.x += (Math.random() - 0.5) * range;
  npc.position.z += (Math.random() - 0.5) * range;
  // Keep within city bounds
  npc.position.x = Math.max(-190, Math.min(190, npc.position.x));
  npc.position.z = Math.max(-190, Math.min(190, npc.position.z));
}

// ─── ACTION: Speak (broadcasts speech to everyone in the room) ───────────────
function actionSpeak(npc, message, io) {
  io.to(npc.room).emit('chatMessage', {
    name: npc.name,
    text: message,
    isGod: false,
    isNPC: true
  });
  io.to(npc.room).emit('npcSpeak', { id: npc.id, message });
  console.log(`[${npc.name}]: "${message}"`);
}

// ─── MEMORY: Load from Redis ─────────────────────────────────────────────────
async function loadMemory(npc) {
  try {
    const saved = await getRedis().get(`npc:${npc.id}:memory`);
    if (saved) {
      npc.memory = typeof saved === 'string' ? JSON.parse(saved) : saved;
    }
    console.log(`[${npc.name}] Loaded ${npc.memory.length} memories from Redis`);
  } catch (e) {
    console.log(`[${npc.name}] No memory found, starting fresh`);
  }
}

// ─── MEMORY: Save to Redis ───────────────────────────────────────────────────
async function saveMemory(npc) {
  try {
    const trimmed = npc.memory.slice(-20); // Keep only last 20 memories
    await getRedis().set(`npc:${npc.id}:memory`, JSON.stringify(trimmed));
  } catch (e) {
    console.log(`[${npc.name}] Memory save error: ${e.message}`);
  }
}

function addMemory(npc, event) {
  npc.memory.push({ time: new Date().toLocaleTimeString(), event });
}

// ─── OBSERVE: Build context string from world state ──────────────────────────
function observe(npc, getPlayers) {
  const players = getPlayers(npc.room);
  const nearby = players.filter(p => {
    const dx = (p.position?.x || 0) - npc.position.x;
    const dz = (p.position?.z || 0) - npc.position.z;
    return Math.sqrt(dx * dx + dz * dz) < 40;
  });

  const hour = new Date().getHours();
  const timeDesc = hour >= 20 || hour < 6 ? 'deep night' : hour < 12 ? 'morning' : 'afternoon';
  const recentMemory = npc.memory.slice(-4).map(m => m.event).join('. ');

  let ctx = `It is ${timeDesc}. `;
  if (nearby.length > 0) {
    ctx += `Players nearby: ${nearby.map(p => p.name).join(', ')}. `;
    nearby.forEach(p => addMemory(npc, `Saw ${p.name} nearby`));
  } else {
    ctx += 'No one is around. ';
  }
  if (recentMemory) ctx += `My recent memories: ${recentMemory}.`;

  return { context: ctx, nearbyPlayers: nearby };
}

// ─── MAIN BRAIN LOOP ─────────────────────────────────────────────────────────
export async function startAnima(config, io, getPlayers) {
  // Build the NPC state object (this is the "VisualScript" equivalent)
  const npc = {
    id: config.id,
    name: config.name,
    personality: config.personality,
    position: { ...config.position },
    color: config.color,
    room: config.room,
    memory: []   // The variable dictionary / memory store
  };

  // Load remembered memories from Redis
  await loadMemory(npc);

  // Broadcast initial position to the room
  setTimeout(() => {
    io.to(npc.room).emit('npcMoved', {
      id: npc.id,
      name: npc.name,
      position: npc.position,
      color: npc.color
    });
    console.log(`[${npc.name}] Anima is awake at (${Math.round(npc.position.x)}, ${Math.round(npc.position.z)})`);
  }, 3000);

  // ─── The Brain Loop ───────────────────────────────────────────────────────
  // Observe → Think → Act → Save. Forever.
  while (true) {
    // WAIT: rest between 10–20 seconds
    await actionWait(10000, 20000);

    // OBSERVE: what's happening around me?
    const { context, nearbyPlayers } = observe(npc, getPlayers);

    // THINK: ask Groq what to do
    const decision = await actionThink(npc, context);

    // ACT
    if (decision.action === 'speak' && decision.message) {
      actionSpeak(npc, decision.message, io);
      if (nearbyPlayers.length > 0) {
        addMemory(npc, `I spoke to ${nearbyPlayers.map(p => p.name).join(' and ')}: "${decision.message}"`);
      } else {
        addMemory(npc, `I said to myself: "${decision.message}"`);
      }
    } else if (decision.action === 'wander') {
      actionWander(npc);
      io.to(npc.room).emit('npcMoved', {
        id: npc.id,
        name: npc.name,
        position: npc.position,
        color: npc.color
      });
    }
    // 'watch' = stay still, do nothing

    // SAVE memory to Redis so it persists when server restarts
    await saveMemory(npc);
  }
}
