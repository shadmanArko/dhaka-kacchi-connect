import type { Pool } from "pg";

/** A staff/owner account for the admin panel - a completely separate
 * identity space from CustomerRecord, never joined/compared against it.
 * See schema.sql's admin_users table comment. */
export type AdminUserRecord = {
  id: string;
  createdAt: string;
  email: string;
  passwordHash: string;
  name: string;
};

export interface AdminUsersRepository {
  findByEmail(email: string): Promise<AdminUserRecord | null>;
  findById(id: string): Promise<AdminUserRecord | null>;
  insertAdminUser(adminUser: AdminUserRecord): Promise<void>;
}

type AdminUserRow = {
  id: string;
  created_at: string;
  email: string;
  password_hash: string;
  name: string;
};

function rowToAdminUser(row: AdminUserRow): AdminUserRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
  };
}

export function createPostgresAdminUsersRepository(pool: Pool): AdminUsersRepository {
  return {
    async findByEmail(email) {
      const result = await pool.query<AdminUserRow>("SELECT * FROM admin_users WHERE email = $1", [
        email,
      ]);
      const row = result.rows[0];
      return row ? rowToAdminUser(row) : null;
    },

    async findById(id) {
      const result = await pool.query<AdminUserRow>("SELECT * FROM admin_users WHERE id = $1", [
        id,
      ]);
      const row = result.rows[0];
      return row ? rowToAdminUser(row) : null;
    },

    async insertAdminUser(adminUser) {
      await pool.query(
        "INSERT INTO admin_users (id, created_at, email, password_hash, name) VALUES ($1,$2,$3,$4,$5)",
        [
          adminUser.id,
          adminUser.createdAt,
          adminUser.email,
          adminUser.passwordHash,
          adminUser.name,
        ],
      );
    },
  };
}
