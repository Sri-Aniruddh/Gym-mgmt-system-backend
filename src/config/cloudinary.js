import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Validate Cloudinary cloud name:
// A valid Cloudinary cloud name consists of lowercase letters, numbers, and underscores/hyphens. It cannot contain spaces.
const rawCloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const isSyntacticallyValidCloudName =
  rawCloudName &&
  rawCloudName !== 'demo_cloud' &&
  rawCloudName !== 'demo' &&
  !rawCloudName.includes(' ') &&
  /^[a-z0-9_-]+$/i.test(rawCloudName);

const isCloudinaryConfigured = Boolean(
  isSyntacticallyValidCloudName &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET &&
  process.env.CLOUDINARY_API_KEY !== 'demo_api_key'
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: rawCloudName,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

/**
 * Save file locally to backend/uploads directory with fully accessible URL
 */
export const saveFileLocally = async (fileBuffer, folder = 'members', mimetype = 'image/jpeg', req = null) => {
  try {
    const subFolder = folder.includes('logo') ? 'logos' : 'members';
    const targetDir = path.join(UPLOADS_DIR, subFolder);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let ext = '.jpg';
    if (mimetype === 'image/png') ext = '.png';
    else if (mimetype === 'image/webp') ext = '.webp';
    else if (mimetype === 'image/svg+xml') ext = '.svg';
    else if (mimetype === 'image/gif') ext = '.gif';

    const filename = `${subFolder}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
    const filePath = path.join(targetDir, filename);

    await fs.promises.writeFile(filePath, fileBuffer);

    let baseUrl = '';
    if (process.env.BACKEND_URL) {
      baseUrl = process.env.BACKEND_URL.replace(/\/$/, '');
    } else if (req) {
      const host = req.get('host') || `localhost:${process.env.PORT || 5000}`;
      const protocol = req.protocol || 'http';
      baseUrl = `${protocol}://${host}`;
    } else {
      baseUrl = `http://localhost:${process.env.PORT || 5000}`;
    }

    return {
      secure_url: `${baseUrl}/uploads/${subFolder}/${filename}`,
      public_id: `local_${filename}`,
      storageType: 'local'
    };
  } catch (localErr) {
    console.error('[Upload] Failed to write local file, generating base64 fallback:', localErr.message);
    const base64 = fileBuffer.toString('base64');
    return {
      secure_url: `data:${mimetype};base64,${base64}`,
      public_id: `inline_${Date.now()}`,
      storageType: 'base64'
    };
  }
};

/**
 * Upload image buffer to Cloudinary with automatic graceful fallback to local storage
 */
export const uploadToCloudinary = async (fileBuffer, folder = 'gym-management/members', options = {}) => {
  const { mimetype = 'image/jpeg', req = null } = options;

  if (!isCloudinaryConfigured) {
    if (rawCloudName && !isSyntacticallyValidCloudName) {
      console.warn(`[Cloudinary] Notice: CLOUDINARY_CLOUD_NAME="${rawCloudName}" is invalid (Cloudinary cloud names cannot contain spaces). Falling back to local storage.`);
    }
    return await saveFileLocally(fileBuffer, folder, mimetype, req);
  }

  try {
    const isLogo = folder.includes('logo');
    const transformations = isLogo
      ? [
          { width: 800, height: 400, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      : [
          { width: 500, height: 500, crop: 'fill', gravity: 'auto' },
          { quality: 'auto', fetch_format: 'auto' }
        ];

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: transformations
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      uploadStream.end(fileBuffer);
    });

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
      storageType: 'cloudinary'
    };
  } catch (cloudinaryError) {
    console.warn(`[Cloudinary] Upload failed (${cloudinaryError.message || cloudinaryError}). Falling back to local storage.`);
    return await saveFileLocally(fileBuffer, folder, mimetype, req);
  }
};

export default cloudinary;
