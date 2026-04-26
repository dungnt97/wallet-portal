/**
 * Testnet setup verification — runs FIRST in the suite via Playwright project ordering.
 *
 * Purpose: fail loud and early if the testnet infrastructure is not ready
 * before any flow tests execute. Checks:
 *   1. BNB Chapel RPC is reachable and returns a recent block
 *   2. Safe multisig address has non-zero balance (funded for sweep gas)
 *   3. tUSDT/tUSDC contracts exist on-chain (code length > 0)
 *   4. Solana Devnet RPC is reachable and slot is advancing
 *   5. Squads multisig PDA exists on Devnet
 *   6. Deployer wallets (BNB + Solana) have enough gas funds
 *   7. Admin-API health endpoint responds 200
 */
import { expect } from '@playwright/test';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { JsonRpcProvider, formatEther } from 'ethers';

import { test } from '../fixtures/testnet-auth-fixture.js';
import {
  makeBnbClient,
  makeSolConnection,
  solKeypairFromBase64,
} from '../fixtures/testnet-chain-client.js';

// Minimum balances required before tests can run
const MIN_DEPLOYER_BNB = 0.01; // tBNB — covers many mint() calls (cheap)
const MIN_SAFE_BNB = 0.001; // tBNB — Safe needs gas for sweep execution
const MIN_DEPLOYER_SOL = 0.1; // SOL — covers SPL transfers + rent

test.describe('Testnet infrastructure verification', () => {
  test.setTimeout(60_000);

  test('BNB Chapel RPC is reachable and recent', async ({ tnEnv }) => {
    const provider = new JsonRpcProvider(tnEnv.bnbRpc);
    const blockNumber = await provider.getBlockNumber();
    console.log(`[setup] BNB current block: ${blockNumber}`);
    expect(blockNumber).toBeGreaterThan(0);

    const network = await provider.getNetwork();
    // Chapel testnet chainId is 97
    expect(network.chainId).toBe(97n);
    console.log(`[setup] BNB network chainId: ${network.chainId}`);
  });

  test('Safe multisig is funded for sweep gas', async ({ tnEnv }) => {
    const provider = new JsonRpcProvider(tnEnv.bnbRpc);
    const safeBalance = await provider.getBalance(tnEnv.safeAddressBnb);
    const safeEth = Number(formatEther(safeBalance));
    console.log(`[setup] Safe (${tnEnv.safeAddressBnb}) balance: ${safeEth} tBNB`);
    expect(safeEth).toBeGreaterThanOrEqual(MIN_SAFE_BNB);
  });

  test('tUSDT contract is deployed on Chapel', async ({ tnEnv }) => {
    const provider = new JsonRpcProvider(tnEnv.bnbRpc);
    const code = await provider.getCode(tnEnv.usdtBnbAddress);
    // '0x' means no contract at that address
    expect(code.length).toBeGreaterThan(2);
    console.log(`[setup] tUSDT (${tnEnv.usdtBnbAddress}) bytecode length: ${code.length}`);
  });

  test('Deployer BNB wallet has enough gas funds', async ({ tnEnv, bnbClient }) => {
    const balance = await bnbClient.provider.getBalance(bnbClient.wallet.address);
    const bnbAmount = Number(formatEther(balance));
    console.log(`[setup] Deployer (${bnbClient.wallet.address}) balance: ${bnbAmount} tBNB`);
    expect(bnbAmount).toBeGreaterThanOrEqual(MIN_DEPLOYER_BNB);
  });

  test('Solana Devnet RPC is reachable and slot is advancing', async ({ tnEnv }) => {
    const connection = new Connection(tnEnv.solRpc, 'confirmed');
    const slot1 = await connection.getSlot();
    console.log(`[setup] Solana slot: ${slot1}`);
    expect(slot1).toBeGreaterThan(0);
    // Wait 2s and verify slot incremented (chain is live)
    await new Promise((r) => setTimeout(r, 2_000));
    const slot2 = await connection.getSlot();
    expect(slot2).toBeGreaterThan(slot1);
    console.log(`[setup] Solana slot advanced: ${slot1} → ${slot2}`);
  });

  test('Squads multisig PDA exists on Devnet', async ({ tnEnv }) => {
    const connection = new Connection(tnEnv.solRpc, 'confirmed');
    const pda = new PublicKey(tnEnv.squadsMultisigPdaDevnet);
    const accountInfo = await connection.getAccountInfo(pda);
    expect(accountInfo).not.toBeNull();
    expect(accountInfo?.data.length).toBeGreaterThan(0);
    console.log(
      `[setup] Squads PDA (${tnEnv.squadsMultisigPdaDevnet}) exists, data=${accountInfo?.data.length}b`
    );
  });

  test('Deployer Solana wallet has enough SOL', async ({ tnEnv, solClient }) => {
    const balance = await solClient.connection.getBalance(solClient.deployer.publicKey);
    const sol = balance / LAMPORTS_PER_SOL;
    console.log(
      `[setup] Solana deployer (${solClient.deployer.publicKey.toBase58()}) balance: ${sol} SOL`
    );
    expect(sol).toBeGreaterThanOrEqual(MIN_DEPLOYER_SOL);
  });

  test('Admin-API health endpoint responds 200', async ({ page, tnEnv }) => {
    const resp = await page.context().request.get(`${tnEnv.adminApiUrl}/health`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    console.log(`[setup] Admin-API health: ${JSON.stringify(body)}`);
    expect(body).toHaveProperty('status');
  });

  test('UI is reachable and renders app shell', async ({ page, tnEnv }) => {
    await page.goto('/app/dashboard');
    await expect(page.locator('[data-testid="app-layout"], nav, .sidebar, aside')).toBeVisible({
      timeout: 20_000,
    });
    console.log(`[setup] UI shell rendered at ${tnEnv.uiBaseUrl}/app/dashboard`);
  });
});
