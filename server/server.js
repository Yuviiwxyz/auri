/**
 * Zero-Retention Signaling & Ephemeral Store-and-Forward Relay Server
 * 
 * Features:
 * 1. Serves the AirChat frontend UI (from dist/) so it works seamlessly on a single port.
 * 2. ZERO PERMANENT STORAGE: No database. Messages and media are only transiently held
 *    in memory while awaiting recipient delivery, then immediately purged upon ACK.
 * 3. ANY-DISTANCE CONNECTIVITY: Relays WebRTC signaling (offers, answers, ICE candidates)
 *    so devices can establish direct P2P data channels across the internet.
 * 4. FALLBACK RELAY: If WebRTC P2P fails due to strict symmetric NAT, or recipient is offline,
 *    messages are queued in RAM with a 7-day TTL and delivered as soon as the recipient reconnects.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');

const PORT = process.env.PORT || 3001;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// HTTP server for static web app & health check
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'Auri Zero-Retention Relay',
      connectedPeers: peerSockets.size,
      queuedMessages: Array.from(offlineQueues.values()).reduce((acc, q) => acc + q.length, 0),
      uptime: process.uptime()
    }));
    return;
  }

  // Static files serving from dist/
  const cleanUrl = req.url.split('?')[0];
  let filePath = path.join(DIST_DIR, cleanUrl === '/' ? 'index.html' : cleanUrl);

  // If requesting a specific file that exists
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA fallback: Return index.html for all client routes
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexPath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Auri: Frontend build not found. Please run "npm run build".');
});

const wss = new WebSocketServer({ server });

// In-memory active peer sockets: peerId -> WebSocket
const peerSockets = new Map();

// In-memory ephemeral queues for offline peers: peerId -> Array of queued messages
// Purged immediately when recipient connects and receives them!
const offlineQueues = new Map();

// Clean up stale queued messages older than 7 days
const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [peerId, queue] of offlineQueues.entries()) {
    const fresh = queue.filter(item => (now - item.timestamp) < MAX_QUEUE_AGE_MS);
    if (fresh.length === 0) {
      offlineQueues.delete(peerId);
    } else {
      offlineQueues.set(peerId, fresh);
    }
  }
}, 60 * 60 * 1000);

function normId(id) {
  return (id || '').trim().toLowerCase();
}

wss.on('connection', (ws) => {
  let currentPeerId = null;

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type } = data;

      switch (type) {
        // 1. Peer registers their ID
        case 'register': {
          const { peerId } = data;
          if (!peerId) return;

          const key = normId(peerId);

          // If peer already had a different ID on this socket, unbind it
          if (currentPeerId && normId(currentPeerId) !== key) {
            peerSockets.delete(normId(currentPeerId));
          }

          currentPeerId = peerId;
          peerSockets.set(key, ws);

          ws.send(JSON.stringify({
            type: 'registered',
            peerId,
            timestamp: Date.now()
          }));

          // Check if there are any queued messages waiting for this peer (case-insensitive)
          if (offlineQueues.has(key)) {
            const queue = offlineQueues.get(key);
            for (const queuedMsg of queue) {
              ws.send(JSON.stringify({
                type: 'chat-message',
                ...queuedMsg,
                fromQueue: true
              }));
            }
            // Clear immediately upon sending
            offlineQueues.delete(key);
          }
          break;
        }

        // 2. WebRTC Signaling: Offer, Answer, ICE Candidate
        case 'signal': {
          const { targetPeerId, signalData } = data;
          const targetWs = peerSockets.get(normId(targetPeerId));

          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'signal',
              senderPeerId: data.senderPeerId || currentPeerId,
              signalData
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'peer-offline',
              targetPeerId
            }));
          }
          break;
        }

        // 3. Ephemeral Relay Message (when direct WebRTC data channel is not used or recipient is offline)
        case 'relay-message': {
          const { targetPeerId, message, senderProfile } = data;
          const targetKey = normId(targetPeerId);
          const targetWs = peerSockets.get(targetKey);
          const senderId = data.senderPeerId || currentPeerId;

          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            // Recipient is online: Deliver immediately
            targetWs.send(JSON.stringify({
              type: 'chat-message',
              senderPeerId: senderId,
              message,
              senderProfile,
              timestamp: Date.now()
            }));

            // Notify sender of delivery
            ws.send(JSON.stringify({
              type: 'message-delivered',
              messageId: message.id,
              targetPeerId
            }));
          } else {
            // Recipient is offline: hold in ephemeral queue until they connect
            if (!offlineQueues.has(targetKey)) {
              offlineQueues.set(targetKey, []);
            }
            offlineQueues.get(targetKey).push({
              senderPeerId: senderId,
              message,
              senderProfile,
              timestamp: Date.now()
            });

            // Notify sender it was queued
            ws.send(JSON.stringify({
              type: 'message-queued',
              messageId: message.id,
              targetPeerId
            }));
          }
          break;
        }

        // 3b. Real-time Profile Updates (Avatar Photo, Display Name, Bio)
        case 'profile-update': {
          const { targetPeerId, profile } = data;
          if (targetPeerId) {
            const targetWs = peerSockets.get(normId(targetPeerId));
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: 'profile-update',
                senderPeerId: data.senderPeerId || currentPeerId,
                profile,
                timestamp: Date.now()
              }));
            }
          }
          break;
        }

        // 4. Message Read / Delivery Acknowledgment
        case 'message-ack': {
          const recipientId = data.targetPeerId || data.senderPeerId;
          const targetWs = recipientId ? peerSockets.get(normId(recipientId)) : null;
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'message-status-update',
              messageId: data.messageId,
              status: data.status
            }));
          }
          break;
        }

        // 5. Typing Indicator
        case 'typing': {
          const { targetPeerId, isTyping } = data;
          const targetWs = peerSockets.get(normId(targetPeerId));
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'typing',
              senderPeerId: data.senderPeerId || currentPeerId,
              isTyping
            }));
          }
          break;
        }

        // 6. Real-time Cross-Device Reaction Synchronization
        case 'reaction': {
          const { targetPeerId, messageId, emoji, senderPeerId } = data;
          if (targetPeerId) {
            const targetWs = peerSockets.get(normId(targetPeerId));
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify({
                type: 'reaction',
                messageId,
                emoji,
                senderPeerId: senderPeerId || currentPeerId,
                timestamp: Date.now()
              }));
            }
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    if (currentPeerId) {
      const key = normId(currentPeerId);
      if (peerSockets.get(key) === ws) {
        peerSockets.delete(key);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket client error:', err);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` Auri Unified Server (Web App + Zero-Retention Relay)`);
  console.log(` Port: ${PORT}`);
  console.log(` Local: http://localhost:${PORT}`);
  console.log(` Zero persistent storage: RAM only, purged upon ACK.`);
  console.log(`=======================================================`);
});
