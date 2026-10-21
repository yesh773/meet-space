import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import auth from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// Only allow safe file types (no .html/.js/.exe etc.)
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.txt', '.docx', '.pptx', '.xlsx', '.zip'];

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    // Random name: users can't overwrite files or guess URLs, and the original name is never used on disk
    filename: (req, file, cb) =>
      cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ALLOWED_EXT.includes(ext) ? cb(null, true) : cb(new Error('File type not allowed'));
  },
});

const router = Router();

// POST /api/files  (multipart/form-data, field name "file")
router.post('/', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  res.status(201).json({ name: req.file.originalname.slice(0, 200), filename: req.file.filename });
});

export default router;
