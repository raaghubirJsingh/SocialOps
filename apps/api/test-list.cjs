const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.$connect().then(async() => {
  const tables = await p.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  console.log('Tables:', tables.map(t => t.table_name).join(', '));
  const stepup = await p.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'AdminStepUp%'`;
  console.log('StepUp tables:', stepup.map(t => t.table_name).join(', '));
  await p.$disconnect();
}).catch(e => console.log('ERR:', e.message));