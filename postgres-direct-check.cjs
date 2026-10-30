require("dotenv").config({ path: ".env", override: true });

const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    const result = await client.query(
      "SELECT current_database() AS db, current_user AS usr"
    );
    console.log("Direct Node PostgreSQL connection successful:", result.rows);
  } catch (error) {
    console.log("Direct Node PostgreSQL connection failed.");
    console.log("Error code:", error.code || error.name);
    console.log("Message:", error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
