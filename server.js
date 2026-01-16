import http from "http";
import { WebSocketServer } from "ws";

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("ok");
});

const wss = new WebSocketServer({ server });
const rooms = new Map();

function makeRoomId() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(roomId, obj) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const ws of room.clients.keys()) send(ws, obj);
}

wss.on("connection", (ws) => {
  ws._roomId = null;
  ws._playerId = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.t === "create") {
      const roomId = makeRoomId();
      rooms.set(roomId, { clients: new Map(), flagClaimedBy: null });
      ws._roomId = roomId;
      ws._playerId = "P1";
      rooms.get(roomId).clients.set(ws, { id: ws._playerId });
      send(ws, { t: "created", roomId, playerId: ws._playerId });
      return;
    }

    if (msg.t === "join") {
      const roomId = String(msg.roomId || "").toUpperCase();
      const room = rooms.get(roomId);
      if (!room) return send(ws, { t: "err", m: "ROOM_NOT_FOUND" });
      if (room.clients.size >= 2) return send(ws, { t: "err", m: "ROOM_FULL" });

      ws._roomId = roomId;
      ws._playerId = room.clients.size === 0 ? "P1" : "P2";
      room.clients.set(ws, { id: ws._playerId });
      send(ws, { t: "joined", roomId, playerId: ws._playerId });

      if (room.clients.size === 2) {
        room.flagClaimedBy = null;
        broadcast(roomId, { t: "start" });
      }
      return;
    }

    if (msg.t === "pos") {
      const room = rooms.get(ws._roomId);
      if (!room) return;
      for (const other of room.clients.keys()) {
        if (other !== ws) {
          send(other, { t: "pos", x: msg.x, y: msg.y, from: ws._playerId });
        }
      }
      return;
    }

    if (msg.t === "claim_flag") {
      const room = rooms.get(ws._roomId);
      if (!room || room.flagClaimedBy) return;
      room.flagClaimedBy = ws._playerId;
      broadcast(ws._roomId, { t: "win", winner: ws._playerId });
      return;
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws._roomId);
    if (!room) return;
    room.clients.delete(ws);
    if (room.clients.size === 0) rooms.delete(ws._roomId);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log("listening on", PORT));
