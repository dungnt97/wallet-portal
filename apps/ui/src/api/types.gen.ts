// AUTO-GENERATED — do not edit by hand.
// Regenerate: pnpm --filter @wp/ui gen:api-types
// Source: http://localhost:3001/openapi.json
//
// This file is a placeholder until the gen:api-types script runs against
// a live admin-api instance. Types below are minimal stubs only.

export type ApiPaths = Record<string, unknown>;

export interface DepositDto {
  id: string;
  userId: string;
  chain: string;
  token: string;
  amount: string;
  status: string;
  txHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalDto {
  id: string;
  userId: string;
  chain: string;
  token: string;
  amount: string;
  toAddress: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDto {
  id: string;
  email: string;
  createdAt: string;
}

export interface StaffDto {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'treasurer' | 'operator' | 'viewer';
  initials: string;
}
