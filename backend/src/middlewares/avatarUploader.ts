import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import multer, { MulterError } from 'multer';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    console.log(file)
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG and WEBP images are allowed'));
      return;
    }
    cb(null, true);
  },
});

export function uploadAvatar(req: Request, res: Response, next: NextFunction): void {
  multerUpload.single('avatar')(req, res, (err) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(StatusCodes.BAD_REQUEST).json({ error: 'File size must not exceed 5MB' });
        return;
      }
      res.status(StatusCodes.BAD_REQUEST).json({ error: err.message });
      return;
    }

    if (err instanceof Error) {
      res.status(StatusCodes.BAD_REQUEST).json({ error: err.message });
      return;
    }

    if (!req.file) {
      res.status(StatusCodes.BAD_REQUEST).json({ error: 'Avatar file is required' });
      return;
    }

    next();
  });
}