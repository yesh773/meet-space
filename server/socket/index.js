import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Room from '../models/Room.js';
import Message from '../models/Message.js';

/*
  In-memory state (fine for one server instance):
  rooms = { roomId: { users: { socketId: { name } }, strokes: [ ...whiteboard segments ] } }
*/
const rooms = {};
const MAX_STROKES = 5000;

const isNum = (n) => typeof n === 'number' && n >= 0 && n <= 1;
const isValidSegment = (s) =>
  s && [s.x0, s.y0, s.x1, s.y1].every(isNum) && /^#[0-9a-f]{6}$/i.test(s.color);
const isValidFilename = (f) => typeof f === 'string' && /^[a-f0-9]{32}(\.[a-z0-9]{1,5})?$/.test(f);

export default function setupSocket(io) {
  // Runs once per connection: only logged-in users may connect
  io.use(async (socket, next) => {
    try {
      const { id } = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
      const user = await User.findById(id).select('name');
      if (!user) throw new Error('no user');
      socket.user = { id: user._id.toString(), name: user.name };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // Is the target socket in the same room as me? (stops people signalling strangers)
    const inMyRoom = (id) => socket.roomId && rooms[socket.roomId]?.users[id];

    const leaveRoom = () => {
      const roomId = socket.roomId;
      if (!roomId || !rooms[roomId]) return;
      socket.to(roomId).emit('user-left', { socketId: socket.id, name: socket.user.name });
      delete rooms[roomId].users[socket.id];
      socket.leave(roomId);
      if (Object.keys(rooms[roomId].users).length === 0) delete rooms[roomId]; // free memory
      socket.roomId = null;
    };

    // ---------- Rooms ----------
    socket.on('join-room', async ({ roomId }) => {
      if (typeof roomId !== 'string' || !(await Room.exists({ roomId }))) {
        return socket.emit('room-error', 'Room not found');
      }
      leaveRoom(); // in case they were already in another room
      socket.join(roomId);
      socket.roomId = roomId;

      rooms[roomId] ||= { users: {}, strokes: [] };
      const existing = Object.entries(rooms[roomId].users).map(([socketId, u]) => ({ socketId, name: u.name }));
      rooms[roomId].users[socket.id] = { name: socket.user.name };

      // The NEW user will send WebRTC offers to everyone already here
      socket.emit('room-users', existing);
      socket.emit('whiteboard-history', rooms[roomId].strokes);
      socket.to(roomId).emit('user-joined', { socketId: socket.id, name: socket.user.name });
    });

    socket.on('leave-room', leaveRoom);
    socket.on('disconnect', leaveRoom);

    // ---------- WebRTC signaling (server only forwards messages) ----------
    socket.on('webrtc-offer', ({ to, offer }) => {
      if (inMyRoom(to)) io.to(to).emit('webrtc-offer', { from: socket.id, name: socket.user.name, offer });
    });
    socket.on('webrtc-answer', ({ to, answer }) => {
      if (inMyRoom(to)) io.to(to).emit('webrtc-answer', { from: socket.id, answer });
    });
    socket.on('ice-candidate', ({ to, candidate }) => {
      if (inMyRoom(to)) io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // ---------- Chat ----------
    socket.on('send-message', async ({ text, file }) => {
      if (!socket.roomId) return;
      const cleanText = String(text || '').trim().slice(0, 1000);
      const hasFile = file && isValidFilename(file.filename);
      if (!cleanText && !hasFile) return;

      const message = await Message.create({
        room: socket.roomId,
        sender: socket.user.id,
        senderName: socket.user.name,
        text: cleanText,
        file: hasFile ? { name: String(file.name || 'file').slice(0, 200), filename: file.filename } : undefined,
      });
      io.to(socket.roomId).emit('receive-message', message); // includes the sender
    });

    // ---------- Whiteboard ----------
    socket.on('whiteboard-draw', (segment) => {
      if (!socket.roomId || !isValidSegment(segment)) return;
      const clean = { x0: segment.x0, y0: segment.y0, x1: segment.x1, y1: segment.y1, color: segment.color };
      const strokes = rooms[socket.roomId].strokes;
      if (strokes.length < MAX_STROKES) strokes.push(clean); // saved so late joiners see the drawing
      socket.to(socket.roomId).emit('whiteboard-draw', clean);
    });

    socket.on('whiteboard-clear', () => {
      if (!socket.roomId) return;
      rooms[socket.roomId].strokes = [];
      socket.to(socket.roomId).emit('whiteboard-clear');
    });

    // ---------- Screen share (just tells others who is presenting; video goes over WebRTC) ----------
    socket.on('screen-share-started', () => {
      if (socket.roomId) socket.to(socket.roomId).emit('screen-share-started', { socketId: socket.id, name: socket.user.name });
    });
    socket.on('screen-share-stopped', () => {
      if (socket.roomId) socket.to(socket.roomId).emit('screen-share-stopped', { socketId: socket.id });
    });
  });
}

