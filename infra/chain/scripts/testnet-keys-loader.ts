import { existsSync, readFileSync } from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';

export interface EvmKeypair {
  address: string;
  privateKey: string;
}

export interface SolKeypair {
  publicKey: string;
  secretKey: string;
}

export interface TestnetKeys {
  evm: { deployer: EvmKeypair; treasurers: EvmKeypair[] };
  sol: { deployer: SolKeypair; treasurers: SolKeypair[] };
}

export interface Deployed {
  SAFE_ADDRESS_BNB_TESTNET?: string;
  SQUADS_MULTISIG_PDA_DEVNET?: string;
  SQUADS_VAULT_PDA_DEVNET?: string;
  [key: string]: string | undefined;
}

export function loadKeys(baseUrl: string): TestnetKeys {
  const keysPath = new URL('../.testnet-keys.json', baseUrl).pathname;
  if (!existsSync(keysPath)) {
    console.error('ERROR: .testnet-keys.json not found. Run `pnpm keygen` first.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(keysPath, 'utf8')) as TestnetKeys;
}

export function loadDeployed(baseUrl: string): Deployed {
  const deployedPath = new URL('../.deployed.json', baseUrl).pathname;
  if (!existsSync(deployedPath)) {
    console.error('ERROR: .deployed.json not found. Run a deploy script first.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(deployedPath, 'utf8')) as Deployed;
}

export function requireEvmTreasurer(keys: TestnetKeys, index: number): EvmKeypair {
  const t = keys.evm.treasurers[index];
  if (!t) {
    console.error(`ERROR: No EVM treasurer at index ${index} in .testnet-keys.json`);
    process.exit(1);
  }
  return t;
}

export function requireSolTreasurer(keys: TestnetKeys, index: number): SolKeypair {
  const t = keys.sol.treasurers[index];
  if (!t) {
    console.error(`ERROR: No Solana treasurer at index ${index} in .testnet-keys.json`);
    process.exit(1);
  }
  return t;
}

export function solKeypairFromBase64(raw: SolKeypair): Keypair {
  return Keypair.fromSecretKey(Buffer.from(raw.secretKey, 'base64'));
}

export function validateKeyIndex(raw: string | undefined): number {
  const idx = raw !== undefined ? parseInt(raw, 10) : 0;
  if (isNaN(idx) || idx < 0 || idx > 2) {
    console.error('ERROR: Key index must be 0, 1, or 2');
    process.exit(1);
  }
  return idx;
}
