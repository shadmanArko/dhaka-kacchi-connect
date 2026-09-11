import type { Pool } from "pg";
import type { AddressFields, CustomerRecord } from "./customers";

/**
 * Everything a route handler needs to persist/read a customer account - and
 * nothing about HOW (Postgres, a fake, a future different database). Mirrors
 * ordersRepository.ts's OrdersRepository exactly: route handlers depend on
 * this interface, never on `pg`/`Pool` directly.
 */

/** A customer row plus the login-lockout bookkeeping columns - only ever
 * needed by the login flow, so kept out of the pure CustomerRecord type. */
export type CustomerAuthRecord = CustomerRecord & {
  failedLoginCount: number;
  lockedUntil: string | null; // ISO 8601, or null if not locked
};

export interface CustomersRepository {
  findByPhoneOrEmail(identifier: string): Promise<CustomerAuthRecord | null>;
  findById(id: string): Promise<CustomerRecord | null>;
  phoneOrEmailTaken(phone: string, email: string): Promise<boolean>;
  insertCustomer(customer: CustomerRecord): Promise<void>;
  /** Address is optional: a pickup order never collects one, and updating a
   * customer's name shouldn't require overwriting their saved address with
   * nothing. */
  updateProfile(id: string, updates: { name: string; address?: AddressFields }): Promise<void>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  recordFailedLogin(id: string, lockUntil: Date | null): Promise<void>;
  recordSuccessfulLogin(id: string): Promise<void>;
}

type CustomerRow = {
  id: string;
  created_at: string;
  phone: string;
  email: string;
  password_hash: string;
  name: string;
  date_of_birth: string;
  address_street: string;
  address_house_number: string;
  address_postal_code: string;
  address_city: string;
  failed_login_count: number;
  locked_until: string | null;
};

function rowToCustomer(row: CustomerRow): CustomerRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    phone: row.phone,
    email: row.email,
    name: row.name,
    dateOfBirth: row.date_of_birth,
    address: {
      street: row.address_street,
      houseNumber: row.address_house_number,
      postalCode: row.address_postal_code,
      city: row.address_city,
    },
    passwordHash: row.password_hash,
  };
}

export function createPostgresCustomersRepository(pool: Pool): CustomersRepository {
  return {
    async findByPhoneOrEmail(identifier) {
      const result = await pool.query<CustomerRow>(
        "SELECT * FROM customers WHERE phone = $1 OR email = $1",
        [identifier],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        ...rowToCustomer(row),
        failedLoginCount: row.failed_login_count,
        lockedUntil: row.locked_until,
      };
    },

    async findById(id) {
      const result = await pool.query<CustomerRow>("SELECT * FROM customers WHERE id = $1", [id]);
      const row = result.rows[0];
      return row ? rowToCustomer(row) : null;
    },

    async phoneOrEmailTaken(phone, email) {
      const result = await pool.query(
        "SELECT 1 FROM customers WHERE phone = $1 OR email = $2 LIMIT 1",
        [phone, email],
      );
      return result.rowCount! > 0;
    },

    async insertCustomer(customer) {
      await pool.query(
        `INSERT INTO customers
          (id, created_at, phone, email, password_hash, name, date_of_birth,
           address_street, address_house_number, address_postal_code, address_city)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          customer.id,
          customer.createdAt,
          customer.phone,
          customer.email,
          customer.passwordHash,
          customer.name,
          customer.dateOfBirth,
          customer.address.street,
          customer.address.houseNumber,
          customer.address.postalCode,
          customer.address.city,
        ],
      );
    },

    async updateProfile(id, { name, address }) {
      if (address) {
        await pool.query(
          `UPDATE customers
           SET name = $1, address_street = $2, address_house_number = $3,
               address_postal_code = $4, address_city = $5, updated_at = now()
           WHERE id = $6`,
          [name, address.street, address.houseNumber, address.postalCode, address.city, id],
        );
      } else {
        await pool.query("UPDATE customers SET name = $1, updated_at = now() WHERE id = $2", [
          name,
          id,
        ]);
      }
    },

    async updatePassword(id, passwordHash) {
      await pool.query(
        "UPDATE customers SET password_hash = $1, updated_at = now() WHERE id = $2",
        [passwordHash, id],
      );
    },

    async recordFailedLogin(id, lockUntil) {
      await pool.query(
        `UPDATE customers
         SET failed_login_count = failed_login_count + 1,
             locked_until = COALESCE($2, locked_until),
             updated_at = now()
         WHERE id = $1`,
        [id, lockUntil],
      );
    },

    async recordSuccessfulLogin(id) {
      await pool.query(
        "UPDATE customers SET failed_login_count = 0, locked_until = NULL, updated_at = now() WHERE id = $1",
        [id],
      );
    },
  };
}
