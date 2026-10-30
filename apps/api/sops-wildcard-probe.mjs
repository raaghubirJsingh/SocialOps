import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
prisma.$on('query', (e) => {
  console.log('SQL>', e.query);
  console.log('PARAMS>', e.params);
});

await prisma.client.findMany({
  where: {
    relationships: { some: { organizationId: '00000000-0000-0000-0000-000000000000', status: 'ACTIVE' } },
    OR: [{ name: { contains: 'a%b_c', mode: 'insensitive' } }],
  },
  orderBy: { createdAt: 'desc' },
  take: 1,
});

await prisma.$disconnect();
