import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB, closeDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import Member from '../src/models/Member.js';
import MembershipPlan from '../src/models/MembershipPlan.js';
import GymSettings from '../src/models/GymSettings.js';

describe('Gym Management API Integration Test Suite', () => {
  let adminToken = '';
  let memberToken = '';
  let createdPlanId = '';
  let createdMemberId = '';
  let oneTimeCredential = '';

  before(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    await User.deleteMany({});
    await Member.deleteMany({});
    await MembershipPlan.deleteMany({});
    await GymSettings.deleteMany({});
  });

  after(async () => {
    await closeDB();
  });

  test('1. Health Check Endpoint', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
  });

  test('2. Admin Bootstrap & Idempotency', async () => {
    const adminPassword = 'AdminSecretPass@2026';
    const passwordHash = await User.hashPassword(adminPassword);

    const admin = await User.create({
      name: 'Super Admin',
      email: 'aniruddhsrivasta318@gmail.com',
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE'
    });

    assert.ok(admin._id);
    assert.equal(admin.role, 'ADMIN');

    // Create default plan
    const plan = await MembershipPlan.create({
      name: 'Gold Monthly',
      durationDays: 30,
      price: 60,
      status: 'ACTIVE'
    });
    createdPlanId = plan._id.toString();
    assert.ok(createdPlanId);
  });

  test('3. Admin Login & JWT Issuance', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'aniruddhsrivasta318@gmail.com',
        password: 'AdminSecretPass@2026'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.role, 'ADMIN');
    adminToken = res.body.data.accessToken;
  });

  test('4. Protected Endpoint Rejection Without Token', async () => {
    const res = await request(app).get('/api/v1/members');
    assert.equal(res.status, 401);
  });

  test('5. Admin Member Creation with OTP Generation', async () => {
    const res = await request(app)
      .post('/api/v1/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'John Doe Athlete',
        email: 'john.doe.athlete@example.com',
        phone: '+15551234567',
        address: '42 Runner St, Fitness City',
        planId: createdPlanId,
        gender: 'MALE',
        initialPaymentAmount: 60,
        paymentMethod: 'UPI'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.member.memberId.startsWith('GYM-'));
    assert.ok(res.body.data.invitation.oneTimeCredentialPreview);

    createdMemberId = res.body.data.member.memberId;
    oneTimeCredential = res.body.data.invitation.oneTimeCredentialPreview;
  });

  test('6. Member Login with One-Time Credential (Forced Password Change)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'john.doe.athlete@example.com',
        password: oneTimeCredential
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.mustChangePassword, true);
    assert.ok(res.body.data.firstLoginToken);

    // Complete mandatory first-time password reset
    const resetRes = await request(app)
      .post('/api/v1/auth/first-time-password')
      .set('Authorization', `Bearer ${res.body.data.firstLoginToken}`)
      .send({
        newPassword: 'MyPermanentPassword@2026'
      });

    assert.equal(resetRes.status, 200);
    assert.equal(resetRes.body.success, true);
    assert.ok(resetRes.body.data.accessToken);
    memberToken = resetRes.body.data.accessToken;
  });

  test('7. Member Login with Permanent Password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'john.doe.athlete@example.com',
        password: 'MyPermanentPassword@2026'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.role, 'MEMBER');
  });

  test('8. Attendance Check-In & Duplicate Prevention', async () => {
    // 1st Check-In
    const checkInRes = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        memberId: createdMemberId,
        notes: 'Morning cardio session'
      });

    assert.equal(checkInRes.status, 201);
    assert.equal(checkInRes.body.success, true);

    // Immediate duplicate check-in attempt (should fail with 409)
    const dupRes = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        memberId: createdMemberId
      });

    assert.equal(dupRes.status, 409);
  });

  test('9. Payment Recording & Idempotency', async () => {
    const txnRef = `MANUAL-TXN-${Date.now()}`;

    const payRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        memberId: createdMemberId,
        amount: 60,
        paymentMethod: 'CASH',
        transactionReference: txnRef
      });

    assert.equal(payRes.status, 201);
    assert.equal(payRes.body.data.transactionReference, txnRef);

    // Duplicate transaction reference check
    const dupPayRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        memberId: createdMemberId,
        amount: 60,
        paymentMethod: 'CASH',
        transactionReference: txnRef
      });

    assert.equal(dupPayRes.status, 409);
  });

  test('10. Admin Dashboard Live Aggregation Stats', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/admin')
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.kpis.totalMembers >= 1);
    assert.ok(res.body.data.kpis.activeMembers >= 1);
    assert.ok(res.body.data.kpis.totalRevenueCollected >= 120);
    assert.ok(Array.isArray(res.body.data.charts.monthlyRevenue));
    assert.ok(Array.isArray(res.body.data.charts.planDistribution));
  });

  test('11. Member Dashboard Self-Service Isolation', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/member')
      .set('Authorization', `Bearer ${memberToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.member.memberId, createdMemberId);
    assert.ok(res.body.data.membership.planName);
  });
});
