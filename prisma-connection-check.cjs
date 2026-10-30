require("dotenv").config({ path: ".env", override: true });
const { PrismaClient } = require("@prisma/client");

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL missing");
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: { db: { url } }
});

prisma.$queryRaw`SELECT current_database() AS db, current_user AS usr`
  .then(result => console.log("Connected:", result))
  .catch(error => {
    console.log("Error code:", error.code || error.name);
    console.log("Message:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
