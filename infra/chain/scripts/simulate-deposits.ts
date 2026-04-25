/**
 * Simulate deposits by sending test tokens to all user deposit addresses.
 *
 * BNB: Calls mint() on our own ERC-20 contracts (emits Transfer event → watcher detects).
 *      Also sends tBNB for sweep gas.
 * SOL: Transfers SPL tokens from deployer to each user ATA (Transfer instruction → watcher detects).
 *
 * Usage:
 *   pnpm tsx scripts/simulate-deposits.ts                    # both chains
 *   pnpm tsx scripts/simulate-deposits.ts --chain bnb        # BNB only
 *   pnpm tsx scripts/simulate-deposits.ts --chain sol        # SOL only
 *   pnpm tsx scripts/simulate-deposits.ts --amount 200       # custom amount per address
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import 'dotenv/config';
import { Contract, JsonRpcProvider, Wallet, parseUnits } from 'ethers';
import * as fs from 'node:fs';
import * as path from 'node:path';

const KEYS_PATH = path.resolve(import.meta.dirname!, '..', '.testnet-keys.json');
const DEPLOYED_PATH = path.resolve(import.meta.dirname!, '..', '.deployed-tokens.json');

const BNB_RPC = process.env.RPC_BNB_PRIMARY ?? 'https://bsc-testnet-rpc.publicnode.com';
const SOL_RPC = process.env.RPC_SOLANA_PRIMARY ?? 'https://api.devnet.solana.com';

const ERC20_ABI = [
  'function mint(address to, uint256 amount)',
  'function balanceOf(address) view returns (uint256)',
];

// User deposit addresses — matches DB user_addresses
const BNB_USER_ADDRESSES = [
  '0xF6254E68accB07eCB3D3FB468eDBBFde51Dda7F8',
  '0x0b36C75a344bA4B758929bf130F4153419e3FAed',
  '0x2FD1f1F257839A08a385922a4CFC2a42897E74DE',
  '0x02c83F1D2E80172074811f9473c1A482713Cc19A',
  '0x4e5e7F7c9c565f9BFD661Ac956CCf7748B82dEf5',
];

const SOL_USER_ADDRESSES = [
  '6B1HRP7t9nQ3SzjSZg8xYHWu6esjN3H3LGRcmqvBLYeJ',
  '5obwTCzTPr26D7FWjxXLmwUwKiYEDLUjA9utD5AYh72x',
  'AtdxZkJkR8okcKYcAYd2fPDFVAJtoncWsHPsXkPCxY79',
  'e5zMSfsDFUkRntqpv3oJSfKuVtxixoerFZtwage5q9j',
  'HBw3Z2agw2cYvs1UPKKQ1kxqsPVPapLcciWn9NfDjZBk',
];

function loadKeys() {
  return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
}

function loadDeployed() {
  return JSON.parse(fs.readFileSync(DEPLOYED_PATH, 'utf8'));
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

async function simulateBnbDeposits(amountPerAddr: number) {
  const keys = loadKeys();
  const deployed = loadDeployed();
  const provider = new JsonRpcProvider(BNB_RPC);
  const wallet = new Wallet(keys.evm.deployer.privateKey, provider);

  console.log('\n=== BNB: Simulating deposits ===');
  console.log(`Deployer: ${wallet.address}`);
  console.log(`tUSDT: ${deployed.bnb.usdt}`);
  console.log(`tUSDC: ${deployed.bnb.usdc}`);
  console.log(`Amount per address: ${amountPerAddr} each token`);

  const usdt = new Contract(deployed.bnb.usdt, ERC20_ABI, wallet);
  const usdc = new Contract(deployed.bnb.usdc, ERC20_ABI, wallet);
  const mintAmount = parseUnits(String(amountPerAddr), 18);

  const bal = await provider.getBalance(wallet.address);
  console.log(`Deployer tBNB: ${Number(bal) / 1e18}`);

  for (const addr of BNB_USER_ADDRESSES) {
    // Send tBNB for sweep gas (0.00005 tBNB per address)
    const gasBal = await provider.getBalance(addr);
    if (gasBal < BigInt(50_000_000_000_000)) {
      console.log(`  Sending 0.00005 tBNB to ${addr} for gas...`);
      const gasTx = await wallet.sendTransaction({
        to: addr,
        value: BigInt(50_000_000_000_000), // 0.00005 BNB
      });
      await gasTx.wait();
    }

    // Mint USDT
    console.log(`  Minting ${amountPerAddr} tUSDT to ${addr}...`);
    const tx1 = await usdt.mint(addr, mintAmount);
    await tx1.wait();
    console.log(`    tx: ${tx1.hash}`);

    // Mint USDC
    console.log(`  Minting ${amountPerAddr} tUSDC to ${addr}...`);
    const tx2 = await usdc.mint(addr, mintAmount);
    await tx2.wait();
    console.log(`    tx: ${tx2.hash}`);
  }

  console.log('\n--- BNB deposits simulated ---');
}

async function simulateSolDeposits(amountPerAddr: number) {
  const keys = loadKeys();
  const deployed = loadDeployed();
  const secretKey = Buffer.from(keys.sol.deployer.secretKey, 'base64');
  const deployer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  const conn = new Connection(SOL_RPC, 'confirmed');

  console.log('\n=== SOL: Simulating deposits ===');
  console.log(`Deployer: ${deployer.publicKey.toBase58()}`);
  console.log(`tUSDT mint: ${deployed.sol.usdt}`);
  console.log(`tUSDC mint: ${deployed.sol.usdc}`);
  console.log(`Amount per address: ${amountPerAddr} each token`);

  const spl = await import('@solana/spl-token');
  const usdtMint = new PublicKey(deployed.sol.usdt);
  const usdcMint = new PublicKey(deployed.sol.usdc);
  const rawAmount = BigInt(amountPerAddr) * 10n ** 6n; // 6 decimals

  // Ensure deployer has enough SOL
  const bal = await conn.getBalance(deployer.publicKey);
  console.log(`Deployer SOL: ${bal / 1e9}`);
  if (bal < 0.5 * 1e9) {
    console.log('  Requesting airdrop...');
    const sig = await conn.requestAirdrop(deployer.publicKey, 2 * 1e9);
    await conn.confirmTransaction(sig, 'confirmed');
  }

  // Get deployer's ATAs (already created during deploy)
  const deployerUsdtAta = await spl.getOrCreateAssociatedTokenAccount(
    conn, deployer, usdtMint, deployer.publicKey
  );
  const deployerUsdcAta = await spl.getOrCreateAssociatedTokenAccount(
    conn, deployer, usdcMint, deployer.publicKey
  );

  // Mint enough supply to deployer for all transfers
  const totalNeeded = rawAmount * BigInt(SOL_USER_ADDRESSES.length);
  const deployerUsdtBal = BigInt(String(deployerUsdtAta.amount));
  if (deployerUsdtBal < totalNeeded) {
    const toMint = totalNeeded - deployerUsdtBal;
    console.log(`  Minting ${Number(toMint) / 1e6} tUSDT to deployer...`);
    await spl.mintTo(conn, deployer, usdtMint, deployerUsdtAta.address, deployer, toMint);
  }
  const deployerUsdcBal = BigInt(String(deployerUsdcAta.amount));
  if (deployerUsdcBal < totalNeeded) {
    const toMint = totalNeeded - deployerUsdcBal;
    console.log(`  Minting ${Number(toMint) / 1e6} tUSDC to deployer...`);
    await spl.mintTo(conn, deployer, usdcMint, deployerUsdcAta.address, deployer, toMint);
  }

  // Transfer from deployer to each user address (creates Transfer instructions → watcher detects)
  for (const addr of SOL_USER_ADDRESSES) {
    const dest = new PublicKey(addr);

    // USDT transfer
    const userUsdtAta = await spl.getOrCreateAssociatedTokenAccount(
      conn, deployer, usdtMint, dest
    );
    console.log(`  Transferring ${amountPerAddr} tUSDT to ${addr}...`);
    const sig1 = await spl.transfer(
      conn, deployer, deployerUsdtAta.address, userUsdtAta.address, deployer, rawAmount
    );
    console.log(`    sig: ${sig1}`);

    // USDC transfer
    const userUsdcAta = await spl.getOrCreateAssociatedTokenAccount(
      conn, deployer, usdcMint, dest
    );
    console.log(`  Transferring ${amountPerAddr} tUSDC to ${addr}...`);
    const sig2 = await spl.transfer(
      conn, deployer, deployerUsdcAta.address, userUsdcAta.address, deployer, rawAmount
    );
    console.log(`    sig: ${sig2}`);
  }

  console.log('\n--- SOL deposits simulated ---');
}

// --- CLI ---
const chain = getArg('--chain') ?? 'all';
const amount = Number(getArg('--amount') ?? '100');

(async () => {
  if (chain === 'bnb' || chain === 'all') {
    await simulateBnbDeposits(amount);
  }
  if (chain === 'sol' || chain === 'all') {
    await simulateSolDeposits(amount);
  }
  console.log('\nDone! Watchers should detect deposits within 5-10 seconds.');
})();
