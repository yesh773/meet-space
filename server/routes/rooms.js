import { Router } from 'express';
import crypto from 'crypto';
import Room from '../models/Room.js';
import Message from '../models/Message.js';
import auth from '../middleware/auth.js';
import asyncHandler from '../middleware/asyncHandler.js';

const router = Router();

// POST /api/rooms  { name }  -> create a room
router.post('/', auth, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 1 || name.length > 60) {
    return res.status(400).json({ message: 'Room name must be 1-60 characters' });
  }
  const room = await Room.create({
    roomId: crypto.randomBytes(4).toString('hex'), // e.g. "a3f9c21b"
    name,
    host: req.userId,
    participants: [req.userId],
  });
  res.status(201).json({ room });
}));

// POST /api/rooms/:roomId/join -> add user to room, return room + last 100 messages
router.post('/:roomId/join', auth, asyncHandler(async (req, res) => {
  const room = await Room.findOneAndUpdate(
    { roomId: req.params.roomId },
    { $addToSet: { participants: req.userId } },
    { new: true }
  );
  if (!room) return res.status(404).json({ message: 'Room not found' });

  const latest = await Message.find({ room: room.roomId }).sort({ createdAt: -1 }).limit(100);
  res.json({ room, messages: latest.reverse() });
}));

export default router;
