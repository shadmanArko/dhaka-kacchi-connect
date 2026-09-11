/** Pure domain types for a customer account - no database, no HTTP. Kept
 * dependency-free on purpose, mirroring orders.ts: the persistence layer
 * (customersRepository.ts) depends on these types, not the other way around. */

export type AddressFields = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
};

/** Everything collected at registration, before the phone is verified. */
export type RegistrationInput = {
  phone: string; // E.164, e.g. "+491701234567"
  name: string;
  dateOfBirth: string; // YYYY-MM-DD
  address: AddressFields;
  email: string;
  password: string;
};

/** A real, verified account. */
export type CustomerRecord = {
  id: string;
  createdAt: string;
  phone: string;
  email: string;
  name: string;
  dateOfBirth: string;
  address: AddressFields;
  passwordHash: string;
};

/** The subset of a customer's own record ever handed back to the client -
 * never includes passwordHash. */
export type PublicCustomer = {
  id: string;
  phone: string;
  email: string;
  name: string;
  dateOfBirth: string;
  address: AddressFields;
};

export function toPublicCustomer(customer: CustomerRecord): PublicCustomer {
  const { passwordHash: _passwordHash, createdAt: _createdAt, ...rest } = customer;
  return rest;
}
