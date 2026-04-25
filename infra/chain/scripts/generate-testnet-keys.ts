import { existsSync, writeFileSync } from 'node:fs';
import { Wallet } from 'ethers';
import { Keypair } from '@solana/web3.js';

const OUTPUT_PATH = new URL('../.testnet-keys.json', import.meta.url).pathname;
const FORCE = process.argv.includes('--force');

if (existsSync(OUTPUT_PATH) && !FORCE) {
  console.log('Keys already exist. Use --force to regenerate.');
  process.exit(0);
}

function evmKeypair(): { address: string; privateKey: string } {
  const w = Wallet.createRandom();
  return { address: w.address, privateKey: w.privateKey };
}

function solKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey.toBase58(),
    secretKey: Buffer.from(kp.secretKey).toString('base64'),
  };
}

const evmDeployer = evmKeypair();
const evmTreasurers = [evmKeypair(), evmKeypair(), evmKeypair()];
const solDeployer = solKeypair();
const solTreasurers = [solKeypair(), solKeypair(), solKeypair()];

const output = {
  evm: {
    deployer: evmDeployer,
    treasurers: evmTreasurers,
  },
  sol: {
    deployer: solDeployer,
    treasurers: solTreasurers,
  },
  _generatedAt: new Date().toISOString(),
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

console.log('=== Testnet keypairs generated ===');
console.log('');
console.log('EVM deployer:    ', evmDeployer.address);
console.log('EVM treasurers:');
evmTreasurers.forEach((t, i) => console.log(`  [${i}] ${t.address}`));
console.log('');
console.log('Solana deployer: ', solDeployer.publicKey);
console.log('Solana treasurers:');
solTreasurers.forEach((t, i) => console.log(`  [${i}] ${t.publicKey}`));
console.log('');
console.log(`Written to: ${OUTPUT_PATH}`);
console.log('IMPORTANT: Keep .testnet-keys.json secret — never commit it.');
