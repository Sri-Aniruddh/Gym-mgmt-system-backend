import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

let memoryServer = null;

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  try {
    // Attempt standard connection first
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 4000
    });
    console.log(`[Database] MongoDB connected successfully to: ${mongoose.connection.host}`);
    return mongoose.connection;
  } catch (primaryErr) {
    // If not production and connection failed (e.g. local mongod service not running), use MongoMemoryServer fallback
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Database] Could not connect to '${uri}'. Starting embedded in-memory MongoDB server for development...`);
      try {
        const { MongoMemoryServer } = await import('mongodb-memory-server');
        memoryServer = await MongoMemoryServer.create();
        const memUri = memoryServer.getUri();
        await mongoose.connect(memUri);
        console.log(`[Database] Embedded in-memory MongoDB started and connected successfully at: ${memUri}`);
        return mongoose.connection;
      } catch (memErr) {
        console.error('[Database] Failed to start in-memory MongoDB fallback:', memErr.message);
        throw primaryErr;
      }
    } else {
      console.error('[Database] MongoDB connection failed:', primaryErr.message);
      throw primaryErr;
    }
  }
};

export const closeDB = async () => {
  try {
    await mongoose.disconnect();
    if (memoryServer) {
      await memoryServer.stop();
    }
    console.log('[Database] MongoDB disconnected cleanly.');
  } catch (err) {
    console.error('[Database] Error closing DB connection:', err.message);
  }
};

export default connectDB;
