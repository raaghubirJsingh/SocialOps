require('dotenv').config({ path: './apps/api/.env' });
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();

  // Check for bot users
  const botsRes = await client.query(
    'SELECT id, email, full_name, is_bot, skill_specialization, is_active FROM "User" WHERE is_bot = true'
  );
  console.log('Bot Users:', JSON.stringify(botsRes.rows, null, 2));

  // Check memberships for bots
  const memRes = await client.query(
    `SELECT m.id, m.user_id, m.organization_id, u.email, o.name as org_name, o.slug 
     FROM "OrganizationMembership" m 
     JOIN "User" u ON m.user_id = u.id 
     JOIN "Organization" o ON m.organization_id = o.id 
     WHERE u.is_bot = true`
  );
  console.log('Bot Memberships:', JSON.stringify(memRes.rows, null, 2));

  // Check clients
  const clientsRes = await client.query(
    'SELECT id, name, type, status, "onboardingStatus", owner_user_id FROM "Client"'
  );
  console.log('Clients:', JSON.stringify(clientsRes.rows, null, 2));
  console.log('Client count:', clientsRes.rowCount);

  // Check all users
  const usersRes = await client.query(
    'SELECT id, email, full_name, is_bot, is_active FROM "User" ORDER BY "createdAt"'
  );
  console.log('All Users (count: ' + usersRes.rowCount + '):', JSON.stringify(usersRes.rows, null, 2));

  // Check organizations
  const orgsRes = await client.query(
    'SELECT id, name, slug, kind FROM "Organization"'
  );
  console.log('Organizations (count: ' + orgsRes.rowCount + '):', JSON.stringify(orgsRes.rows, null, 2));

  await client.end();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});