import app from './app.js';
import { connectDB, closeDB } from './config/db.js';
import { syncExpiredMemberships } from './services/membershipSyncService.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Connect to Database
    await connectDB();

    // Initial sync of expired memberships
    await syncExpiredMemberships();
    // Run sync check every 5 minutes
    const syncInterval = setInterval(syncExpiredMemberships, 5 * 60 * 1000);

    // 2. Start HTTP Server
    const server = app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`[Server] Gym Management API running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);
      console.log(`[Server] API Base: http://localhost:${PORT}/api/v1`);
      console.log(`=======================================================`);
    });

    // 3. Graceful Shutdown Handlers
    const handleShutdown = async (signal) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      clearInterval(syncInterval);
      server.close(async () => {
        await closeDB();
        console.log('[Server] Process terminated cleanly.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  } catch (error) {
    console.error('[Server Error] Failed to start application:', error.message);
    process.exit(1);
  }
};

startServer();
