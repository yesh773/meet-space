import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';

import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import fileRoutes, { uploadDir } from './routes/files.js';
import setupSocket from './socket/index.js';

const app = express();
const server = http.createServer(app);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';

app.set('trust proxy', 1); 
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '10kb' }));


app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }), authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/files', fileRoutes);


app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment'),
}));


app.use((err, req, res, next) => {
  console.error(err.message);
  const isClientError = err.name === 'MulterError' || err.message === 'File type not allowed';
  res.status(isClientError ? 400 : 500).json({ message: isClientError ? err.message : 'Server error' });
});


const io = new Server(server, { cors: { origin: CLIENT_URL } });
setupSocket(io);


const PORT = process.env.PORT || 5000;
connectDB().then(() => server.listen(PORT, () => console.log(`Server running on port ${PORT}`)));
