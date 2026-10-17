import multer from 'multer';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

// Multer memory storage
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, SVG, GIF) are allowed'), false);
    }
  }
});

export class UploadController {
  /**
   * Upload image to Cloudinary (or local fallback)
   */
  static async uploadImage(req, res) {
    try {
      if (!req.file) {
        return errorResponse(res, 'No image file provided', 400);
      }

      const requestedFolder = req.body?.folder || req.query?.folder || '';
      const isLogo = requestedFolder.toLowerCase().includes('logo');
      const folder = isLogo ? 'gym-management/logos' : 'gym-management/members';

      const result = await uploadToCloudinary(req.file.buffer, folder, {
        mimetype: req.file.mimetype,
        req
      });

      return successResponse(res, 'Image uploaded successfully', {
        imageUrl: result.secure_url,
        url: result.secure_url,
        publicId: result.public_id,
        storageType: result.storageType
      });
    } catch (error) {
      console.error('[UploadController.uploadImage]', error);
      return errorResponse(res, error.message || 'Image upload failed', 500);
    }
  }
}

export default UploadController;
