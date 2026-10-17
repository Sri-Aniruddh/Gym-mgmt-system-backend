import express from 'express';
import UploadController, { upload } from '../controllers/uploadController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

// Support both /image and root / routes
router.post('/image', upload.single('image'), UploadController.uploadImage);
router.post('/', upload.single('image'), UploadController.uploadImage);

export default router;
