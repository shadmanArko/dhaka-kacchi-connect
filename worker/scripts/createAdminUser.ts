// One-time script to create (or reset the password of) an admin-panel
// account - there's no self-serve admin signup, on purpose. Usage:
//   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD=... \
//     npm run admin:create-user
//
// Safe to re-run for the same email - updates the existing account's
// name/password instead of failing on the unique index, so this also
// doubles as "how do I reset the admin password."
import { Pool } from "pg";
import { config } from "../src/config";
import { hashPassword } from "../src/lib/auth";
import { createPostgresAdminUsersRepository } from "../src/lib/adminUsersRepository";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !name || !password) {
    console.error("ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD must all be set.");
    console.error(
      'Usage: ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD=... npm run admin:create-user',
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    const adminUsersRepository = createPostgresAdminUsersRepository(pool);
    const passwordHash = await hashPassword(password);
    const existing = await adminUsersRepository.findByEmail(email);

    if (existing) {
      // No updatePassword/updateProfile method exists on
      // AdminUsersRepository - this script is the only caller that would
      // ever need one, so it talks to the pool directly rather than
      // growing that interface for a single one-time-script use case.
      await pool.query("UPDATE admin_users SET name = $1, password_hash = $2 WHERE id = $3", [
        name,
        passwordHash,
        existing.id,
      ]);
      console.log(`Updated existing admin account: ${email}`);
    } else {
      await adminUsersRepository.insertAdminUser({
        id: `adm_${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        email,
        passwordHash,
        name,
      });
      console.log(`Created admin account: ${email}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("createAdminUser failed:", err);
  process.exitCode = 1;
});
