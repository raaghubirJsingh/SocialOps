const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.$connect().then(async() => {
  const r = await p.$queryRaw`select version()`;
  console.log('PG:', r[0]?.version);
  await p.$disconnect();
}).catch(e => console.log('ERR:', e.message));