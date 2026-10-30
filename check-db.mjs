import { PrismaClient } from './apps/api/dist/generated/prisma-client/index.js';
const prisma = new PrismaClient();

async function check() {
  try {
    // Check for bot users
    const botUsers = await prisma.user.findMany({
      where: { isBot: true },
      select: { id: true, email: true, fullName: true, isBot: true, skillSpecialization: true, isActive: true }
    });
    console.log('Bot Users:', JSON.stringify(botUsers, null, 2));

    // Check memberships for bots
    const botMemberships = await prisma.organizationMembership.findMany({
      where: { user: { isBot: true } },
      include: { user: { select: { id: true, email: true, fullName: true } }, organization: { select: { id: true, name: true, slug: true } } }
    });
    console.log('Bot Memberships:', JSON.stringify(botMemberships, null, 2));

    // Check clients
    const clients = await prisma.client.findMany({
      select: { id: true, name: true, type: true, status: true, onboardingStatus: true, ownerUserId: true }
    });
    console.log('Clients:', JSON.stringify(clients, null, 2));

    // Check all users
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true, isBot: true, isActive: true }
    });
    console.log('All Users:', JSON.stringify(allUsers, null, 2));
    
    // Check organizations
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, slug: true, kind: true }
    });
    console.log('Organizations:', JSON.stringify(orgs, null, 2));
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();