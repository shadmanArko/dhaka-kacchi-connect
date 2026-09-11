import type { Pool } from "pg";
import type { AddressFields } from "./customers";

/** A pending registration, held here until its OTP is confirmed - see
 * schema.sql's otp_codes table comment for why this isn't a `customers` row
 * yet. */
export type OtpCodeRecord = {
  id: string;
  expiresAt: Date;
  attempts: number;
  phone: string;
  codeHash: string;
  pending: {
    name: string;
    email: string;
    passwordHash: string;
    dateOfBirth: string;
    address: AddressFields;
  };
};

export interface OtpRepository {
  countRecentSendsByPhone(phone: string, sinceHours: number): Promise<number>;
  countRecentSendsByIp(ipAddress: string, sinceHours: number): Promise<number>;
  createOtp(params: {
    id: string;
    createdAt: string;
    expiresAt: Date;
    phone: string;
    ipAddress: string | null;
    codeHash: string;
    pending: OtpCodeRecord["pending"];
  }): Promise<void>;
  /** The most recent not-yet-consumed code for a phone, whether or not it
   * has expired - callers distinguish "expired" from "no code requested"
   * themselves, since that's a more helpful message here than the
   * enumeration-sensitive login flow, where no such distinction is made. */
  findLatestActiveByPhone(phone: string): Promise<OtpCodeRecord | null>;
  incrementAttempts(id: string): Promise<void>;
  consumeOtp(id: string): Promise<void>;
}

type OtpRow = {
  id: string;
  expires_at: Date;
  attempts: number;
  phone: string;
  code_hash: string;
  pending_name: string;
  pending_email: string;
  pending_password_hash: string;
  pending_date_of_birth: string;
  pending_address_street: string;
  pending_address_house_number: string;
  pending_address_postal_code: string;
  pending_address_city: string;
};

function rowToOtp(row: OtpRow): OtpCodeRecord {
  return {
    id: row.id,
    expiresAt: row.expires_at,
    attempts: row.attempts,
    phone: row.phone,
    codeHash: row.code_hash,
    pending: {
      name: row.pending_name,
      email: row.pending_email,
      passwordHash: row.pending_password_hash,
      dateOfBirth: row.pending_date_of_birth,
      address: {
        street: row.pending_address_street,
        houseNumber: row.pending_address_house_number,
        postalCode: row.pending_address_postal_code,
        city: row.pending_address_city,
      },
    },
  };
}

export function createPostgresOtpRepository(pool: Pool): OtpRepository {
  return {
    async countRecentSendsByPhone(phone, sinceHours) {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM otp_codes
         WHERE phone = $1 AND created_at::timestamptz > now() - ($2::text || ' hours')::interval`,
        [phone, sinceHours],
      );
      return Number(result.rows[0]!.count);
    },

    async countRecentSendsByIp(ipAddress, sinceHours) {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM otp_codes
         WHERE ip_address = $1 AND created_at::timestamptz > now() - ($2::text || ' hours')::interval`,
        [ipAddress, sinceHours],
      );
      return Number(result.rows[0]!.count);
    },

    async createOtp({ id, createdAt, expiresAt, phone, ipAddress, codeHash, pending }) {
      await pool.query(
        `INSERT INTO otp_codes
          (id, created_at, expires_at, phone, ip_address, code_hash,
           pending_name, pending_email, pending_password_hash, pending_date_of_birth,
           pending_address_street, pending_address_house_number, pending_address_postal_code, pending_address_city)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          id,
          createdAt,
          expiresAt,
          phone,
          ipAddress,
          codeHash,
          pending.name,
          pending.email,
          pending.passwordHash,
          pending.dateOfBirth,
          pending.address.street,
          pending.address.houseNumber,
          pending.address.postalCode,
          pending.address.city,
        ],
      );
    },

    async findLatestActiveByPhone(phone) {
      const result = await pool.query<OtpRow>(
        `SELECT * FROM otp_codes
         WHERE phone = $1 AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [phone],
      );
      const row = result.rows[0];
      return row ? rowToOtp(row) : null;
    },

    async incrementAttempts(id) {
      await pool.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [id]);
    },

    async consumeOtp(id) {
      await pool.query("UPDATE otp_codes SET consumed_at = now() WHERE id = $1", [id]);
    },
  };
}
