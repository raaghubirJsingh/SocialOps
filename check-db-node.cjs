const path = require('path');
require('dotenv').config({ path: './apps/api/.env' });
const { PrismaClient } = require(path.join(__dirname, 'node_modules', '.prisma', 'client', 'default.js'));

const prisma = new PrismaClient();

async function main() {
  // Check for bot users
  const bots = await prisma.$queryRaw`
    SELECT id, email, "fullName", "isBot", "skillSpecialization", "isActive" 
    FROM "User" 
    WHERE "isBot" = true
  `;
  console.log('=== Bot Users ===');
  console.log(JSON.stringify(bots, null, 2));

  // Check memberships for bots
  const botMemberships = await prisma.$queryRaw`
    SELECT m.id, m."userId", m."organizationId", u.email, o.name as "orgName"
    FROM "OrganizationMembership" m
    JOIN "User" u ON m."userId" = u."id"
    JOIN "Organization" o ON m."organizationId" = o."id"
    WHERE u."isBot" = true
  `;
  console.log('=== Bot Memberships ===');
  console.log(JSON.stringify(botMemberships, null, 2));

  // Check all clients
  const clients = await prisma.$queryRaw`
    SELECT id, name, type, status, "onboardingStatus", "ownerUserId" 
    FROM "Client"
  `;
  console.log('=== Clients (count: ' + clients.length + ') ===');
  console.log(JSON.stringify(clients, null, 2));

  // Check all users
  const users = await prisma.$queryRaw`
    SELECT id, email, "fullName", "isBot", "isActive", "accountType" 
    FROM "User"
    ORDER BY "createdAt"
  `;
  console.log('=== All Users (count: ' + users.length + ') ===');
  console.log(JSON.stringify(users, null, 2));

  // Check organizations
  const orgs = await prisma.$queryRaw`
    SELECT id, name, slug, kind 
    FROM "Organization"
  `;
  console.log('=== Organizations (count: ' + orgs.length + ') ===');
  console.log(JSON.stringify(orgs, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});