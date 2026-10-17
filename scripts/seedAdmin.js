import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB, closeDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import MembershipPlan from '../src/models/MembershipPlan.js';
import GymSettings from '../src/models/GymSettings.js';
import AuditLog from '../src/models/AuditLog.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    console.log('[Seed] Starting database initialization and admin seeding...');
    await connectDB();

    const adminEmail = (process.env.ADMIN_EMAIL || 'aniruddhsrivasta318@gmail.com').toLowerCase().trim();
    const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'AdminSecurePass@2026';

    if (!adminPassword || adminPassword.length < 8) {
      throw new Error('ADMIN_INITIAL_PASSWORD must be at least 8 characters long');
    }

    // 1. Check if admin user already exists
    let admin = await User.findOne({ email: adminEmail });

    if (admin) {
      console.log(`[Seed] User with email '${adminEmail}' already exists.`);
      if (admin.role !== 'ADMIN') {
        admin.role = 'ADMIN';
        await admin.save();
        console.log(`[Seed] Updated role to ADMIN for user '${adminEmail}'.`);
      } else {
        console.log('[Seed] User is already ADMIN. Preserving existing password and settings (idempotent).');
      }
    } else {
      console.log(`[Seed] Creating new admin account for '${adminEmail}'...`);
      const passwordHash = await User.hashPassword(adminPassword);

      admin = await User.create({
        name: 'Gym Administrator',
        email: adminEmail,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        mustChangePassword: false
      });

      console.log(`[Seed] Admin user successfully created with ID: ${admin._id}`);

      await AuditLog.create({
        actorUserId: admin._id,
        actorName: 'System Seeder',
        actorEmail: adminEmail,
        action: 'ADMIN_BOOTSTRAP',
        targetType: 'USER',
        targetId: admin._id.toString(),
        details: { email: adminEmail, role: 'ADMIN' }
      });
    }

    // 2. Seed Default Membership Plans if none exist
    const planCount = await MembershipPlan.countDocuments();
    if (planCount === 0) {
      console.log('[Seed] Seeding initial standard membership plans...');
      const defaultPlans = [
        {
          name: 'Monthly Standard',
          durationDays: 30,
          price: 49,
          description: 'Full access to gym equipment, cardio zone, and locker facilities for 30 days.',
          status: 'ACTIVE'
        },
        {
          name: 'Quarterly Pro',
          durationDays: 90,
          price: 129,
          description: '90-day access including gym, steam room, and 1 complimentary trainer assessment.',
          status: 'ACTIVE'
        },
        {
          name: 'Half-Yearly Elite',
          durationDays: 180,
          price: 229,
          description: '180 days unlimited gym access, free locker, and 2 guest passes.',
          status: 'ACTIVE'
        },
        {
          name: 'Annual VIP All-Access',
          durationDays: 365,
          price: 399,
          description: 'Full 365-day VIP access to all gym equipment, group fitness classes, and priority trainer booking.',
          status: 'ACTIVE'
        }
      ];

      await MembershipPlan.insertMany(defaultPlans);
      console.log(`[Seed] Created ${defaultPlans.length} default membership plans.`);
    } else {
      console.log(`[Seed] Found ${planCount} existing membership plans. Skipping plan seeding.`);
    }

    // 3. Ensure Default Gym Settings exist
    const settings = await GymSettings.getSettings();
    console.log(`[Seed] Gym settings initialized for: "${settings.gymName}"`);

    console.log('[Seed] Admin seeding and bootstrap completed successfully!');
  } catch (error) {
    console.error('[Seed Error] Failed to seed admin:', error.message);
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
};

seedAdmin();
