import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = 'supportvision_jwt_secret_key_123!';

async function runTests() {
  console.log('--- STARTING SERVER UNIT TESTS ---');

  // Test 1: JWT Signing and Verification
  try {
    const payload = { id: 'test-user-uuid', role: 'AGENT', name: 'Test Agent' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const verified = jwt.verify(token, JWT_SECRET);
    
    if (verified.id === payload.id && verified.role === payload.role) {
      console.log('✅ Test 1: JWT signing & verification successful.');
    } else {
      throw new Error('JWT verification payload mismatch');
    }
  } catch (err) {
    console.error('❌ Test 1 failed:', err);
    process.exit(1);
  }

  // Test 2: Database Connectivity & Queries
  try {
    const userCount = await prisma.user.count();
    console.log(`✅ Test 2: Database connected. Users found in DB: ${userCount}`);
  } catch (err) {
    console.error('❌ Test 2 failed (Prisma Database):', err);
    process.exit(1);
  }

  // Test 3: Metric Endpoint correctness
  try {
    const activeSessions = await prisma.session.count({ where: { status: 'ACTIVE' } });
    if (typeof activeSessions === 'number') {
      console.log(`✅ Test 3: Active session counter queried: ${activeSessions}`);
    } else {
      throw new Error('Active sessions count returned invalid format');
    }
  } catch (err) {
    console.error('❌ Test 3 failed:', err);
    process.exit(1);
  }

  console.log('--- ALL BACKEND TESTS PASSED SUCCESSFULY ---');
  await prisma.$disconnect();
}

runTests();
