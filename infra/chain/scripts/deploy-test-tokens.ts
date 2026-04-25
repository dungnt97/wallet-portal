/**
 * Deploy test ERC-20 tokens (tUSDT, tUSDC) on BSC testnet
 * and SPL tokens on Solana devnet, then mint to a target address.
 *
 * Usage:
 *   pnpm tsx scripts/deploy-test-tokens.ts --chain bnb --to 0x...
 *   pnpm tsx scripts/deploy-test-tokens.ts --chain sol --to <base58>
 *   pnpm tsx scripts/deploy-test-tokens.ts --chain all --to-bnb 0x... --to-sol <base58>
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import 'dotenv/config';
import { ContractFactory, JsonRpcProvider, parseUnits, Wallet } from 'ethers';
import * as fs from 'node:fs';
import * as path from 'node:path';

const KEYS_PATH = path.resolve(import.meta.dirname!, '..', '.testnet-keys.json');
const DEPLOYED_PATH = path.resolve(import.meta.dirname!, '..', '.deployed-tokens.json');

const BNB_RPC = process.env.RPC_BNB_PRIMARY ?? 'https://data-seed-prebsc-1-s1.binance.org:8545';
const SOL_RPC = process.env.RPC_SOLANA_PRIMARY ?? 'https://api.devnet.solana.com';

const TEST_TOKEN_ABI = [
  'constructor(string _name, string _symbol)',
  'function mint(address to, uint256 amount)',
  'function balanceOf(address) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

// Compiled bytecode from TestToken.sol (solc 0.8.28)
const TEST_TOKEN_BYTECODE =
  '0x608060405234801561000f575f5ffd5b506040516110ca3803806110ca833981810160405281019061003191906101a4565b815f908161003f919061042a565b50806001908161004f919061042a565b5050506104f9565b5f604051905090565b5f5ffd5b5f5ffd5b5f5ffd5b5f5ffd5b5f601f19601f8301169050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b6100b682610070565b810181811067ffffffffffffffff821117156100d5576100d4610080565b5b80604052505050565b5f6100e7610057565b90506100f382826100ad565b919050565b5f67ffffffffffffffff82111561011257610111610080565b5b61011b82610070565b9050602081019050919050565b8281835e5f83830152505050565b5f610148610143846100f8565b6100de565b9050828152602081018484840111156101645761016361006c565b5b61016f848285610128565b509392505050565b5f82601f83011261018b5761018a610068565b5b815161019b848260208601610136565b91505092915050565b5f5f604083850312156101ba576101b9610060565b5b5f83015167ffffffffffffffff8111156101d7576101d6610064565b5b6101e385828601610177565b925050602083015167ffffffffffffffff81111561020457610203610064565b5b61021085828601610177565b9150509250929050565b5f81519050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f600282049050600182168061026857607f821691505b60208210810361027b5761027a610224565b5b50919050565b5f819050815f5260205f209050919050565b5f6020601f8301049050919050565b5f82821b905092915050565b5f600883026102dd7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff826102a2565b6102e786836102a2565b95508019841693508086168417925050509392505050565b5f819050919050565b5f819050919050565b5f61032b610326610321846102ff565b610308565b6102ff565b9050919050565b5f819050919050565b61034483610311565b61035861035082610332565b8484546102ae565b825550505050565b5f5f905090565b61036f610360565b61037a81848461033b565b505050565b5b8181101561039d576103925f82610367565b600181019050610380565b5050565b601f8211156103e2576103b381610281565b6103bc84610293565b810160208510156103cb578190505b6103df6103d785610293565b83018261037f565b50505b505050565b5f82821c905092915050565b5f6104025f19846008026103e7565b1980831691505092915050565b5f61041a83836103f3565b9150826002028217905092915050565b6104338261021a565b67ffffffffffffffff81111561044c5761044b610080565b5b6104568254610251565b6104618282856103a1565b5f60209050601f831160018114610492575f8415610480578287015190505b61048a858261040f565b8655506104f1565b601f1984166104a086610281565b5f5b828110156104c7578489015182556001820191506020850194506020810190506104a2565b868310156104e457848901516104e0601f8916826103f3565b8355505b6001600288020188555050505b505050505050565b610bc4806105065f395ff3fe608060405234801561000f575f5ffd5b506004361061009c575f3560e01c806340c10f191161006457806340c10f191461015a57806370a082311461017657806395d89b41146101a6578063a9059cbb146101c4578063dd62ed3e146101f45761009c565b806306fdde03146100a0578063095ea7b3146100be57806318160ddd146100ee57806323b872dd1461010c578063313ce5671461013c575b5f5ffd5b6100a8610224565b6040516100b59190610867565b60405180910390f35b6100d860048036038101906100d39190610918565b6102af565b6040516100e59190610970565b60405180910390f35b6100f661039c565b6040516101039190610998565b60405180910390f35b610126600480360381019061012191906109b1565b6103a2565b6040516101339190610970565b60405180910390f35b610144610547565b6040516101519190610a1c565b60405180910390f35b610174600480360381019061016f9190610918565b61054c565b005b610190600480360381019061018b9190610a35565b610620565b60405161019d9190610998565b60405180910390f35b6101ae610635565b6040516101bb9190610867565b60405180910390f35b6101de60048036038101906101d99190610918565b6106c1565b6040516101eb9190610970565b60405180910390f35b61020e60048036038101906102099190610a60565b6107d7565b60405161021b9190610998565b60405180910390f35b5f805461023090610acb565b80601f016020809104026020016040519081016040528092919081815260200182805461025c90610acb565b80156102a75780601f1061027e576101008083540402835291602001916102a7565b820191905f5260205f20905b81548152906001019060200180831161028a57829003601f168201915b505050505081565b5f8160045f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f20819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9258460405161038a9190610998565b60405180910390a36001905092915050565b60025481565b5f8160045f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f82825461042a9190610b28565b925050819055508160035f8673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f82825461047d9190610b28565b925050819055508160035f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546104d09190610b5b565b925050819055508273ffffffffffffffffffffffffffffffffffffffff168473ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516105349190610998565b60405180910390a3600190509392505050565b601281565b8060025f82825461055d9190610b5b565b925050819055508060035f8473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546105b09190610b5b565b925050819055508173ffffffffffffffffffffffffffffffffffffffff165f73ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef836040516106149190610998565b60405180910390a35050565b6003602052805f5260405f205f915090505481565b6001805461064290610acb565b80601f016020809104026020016040519081016040528092919081815260200182805461066e90610acb565b80156106b95780601f10610690576101008083540402835291602001916106b9565b820191905f5260205f20905b81548152906001019060200180831161069c57829003601f168201915b505050505081565b5f8160035f3373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f82825461070e9190610b28565b925050819055508160035f8573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020015f205f8282546107619190610b5b565b925050819055508273ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef846040516107c59190610998565b60405180910390a36001905092915050565b6004602052815f5260405f20602052805f5260405f205f91509150505481565b5f81519050919050565b5f82825260208201905092915050565b8281835e5f83830152505050565b5f601f19601f8301169050919050565b5f610839826107f7565b6108438185610801565b9350610853818560208601610811565b61085c8161081f565b840191505092915050565b5f6020820190508181035f83015261087f818461082f565b905092915050565b5f5ffd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f6108b48261088b565b9050919050565b6108c4816108aa565b81146108ce575f5ffd5b50565b5f813590506108df816108bb565b92915050565b5f819050919050565b6108f7816108e5565b8114610901575f5ffd5b50565b5f81359050610912816108ee565b92915050565b5f5f6040838503121561092e5761092d610887565b5b5f61093b858286016108d1565b925050602061094c85828601610904565b9150509250929050565b5f8115159050919050565b61096a81610956565b82525050565b5f6020820190506109835f830184610961565b92915050565b610992816108e5565b82525050565b5f6020820190506109ab5f830184610989565b92915050565b5f5f5f606084860312156109c8576109c7610887565b5b5f6109d5868287016108d1565b93505060206109e6868287016108d1565b92505060406109f786828701610904565b9150509250925092565b5f60ff82169050919050565b610a1681610a01565b82525050565b5f602082019050610a2f5f830184610a0d565b92915050565b5f60208284031215610a4a57610a49610887565b5b5f610a57848285016108d1565b91505092915050565b5f5f60408385031215610a7657610a75610887565b5b5f610a83858286016108d1565b9250506020610a94858286016108d1565b9150509250929050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f6002820490506001821680610ae257607f821691505b602082108103610af557610af4610a9e565b5b50919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f610b32826108e5565b9150610b3d836108e5565b9250828203905081811115610b5557610b54610afb565b5b92915050565b5f610b65826108e5565b9150610b70836108e5565b9250828201905080821115610b8857610b87610afb565b5b9291505056fea26469706673582212201264379392e631bd7014c91b6b4f453728d61372aac3a67d94d64b8d5be567eb64736f6c634300081c0033';

interface DeployedTokens {
  bnb?: { usdt: string; usdc: string; deployer: string; mintedTo?: string };
  sol?: { usdt: string; usdc: string; deployer: string; mintedTo?: string };
}

function loadKeys() {
  return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
}

function loadDeployed(): DeployedTokens {
  try {
    return JSON.parse(fs.readFileSync(DEPLOYED_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveDeployed(d: DeployedTokens) {
  fs.writeFileSync(DEPLOYED_PATH, JSON.stringify(d, null, 2) + '\n');
}

async function deployBnbTokens(toAddress: string) {
  const keys = loadKeys();
  const provider = new JsonRpcProvider(BNB_RPC);
  const wallet = new Wallet(keys.evm.deployer.privateKey, provider);

  console.log(`\n=== BSC Testnet: deploying tUSDT + tUSDC ===`);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Mint to:  ${toAddress}`);

  const bal = await provider.getBalance(wallet.address);
  console.log(`Balance:  ${Number(bal) / 1e18} tBNB`);

  const factory = new ContractFactory(TEST_TOKEN_ABI, TEST_TOKEN_BYTECODE, wallet);

  // Deploy tUSDT
  console.log('\nDeploying tUSDT...');
  const usdt = await factory.deploy('Test USDT', 'tUSDT');
  await usdt.waitForDeployment();
  const usdtAddr = await usdt.getAddress();
  console.log(`tUSDT deployed: ${usdtAddr}`);

  // Deploy tUSDC
  console.log('Deploying tUSDC...');
  const usdc = await factory.deploy('Test USDC', 'tUSDC');
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log(`tUSDC deployed: ${usdcAddr}`);

  // Mint 1000 each to target
  const amount = parseUnits('1000', 18);
  console.log(`\nMinting 1000 tUSDT to ${toAddress}...`);
  const tx1 = await (usdt as any).mint(toAddress, amount);
  await tx1.wait();
  console.log(`Mint tx: ${tx1.hash}`);

  console.log(`Minting 1000 tUSDC to ${toAddress}...`);
  const tx2 = await (usdc as any).mint(toAddress, amount);
  await tx2.wait();
  console.log(`Mint tx: ${tx2.hash}`);

  const deployed = loadDeployed();
  deployed.bnb = { usdt: usdtAddr, usdc: usdcAddr, deployer: wallet.address, mintedTo: toAddress };
  saveDeployed(deployed);

  console.log('\n--- BNB Done ---');
  console.log(`tUSDT: ${usdtAddr}`);
  console.log(`tUSDC: ${usdcAddr}`);
  console.log(`Minted 1000 each to ${toAddress}`);

  return { usdt: usdtAddr, usdc: usdcAddr };
}

async function deploySolTokens(toAddress: string) {
  console.log(`\n=== Solana Devnet: creating SPL test tokens ===`);
  console.log(`Mint to: ${toAddress}`);

  const keys = loadKeys();
  const secretKey = Buffer.from(keys.sol.deployer.secretKey, 'base64');
  const deployer = Keypair.fromSecretKey(new Uint8Array(secretKey));
  const conn = new Connection(SOL_RPC, 'confirmed');

  const bal = await conn.getBalance(deployer.publicKey);
  console.log(`Deployer: ${deployer.publicKey.toBase58()}`);
  console.log(`Balance:  ${bal / 1e9} SOL`);

  if (bal < 0.01 * 1e9) {
    console.log('Requesting airdrop...');
    const sig = await conn.requestAirdrop(deployer.publicKey, 2 * 1e9);
    await conn.confirmTransaction(sig, 'confirmed');
    console.log('Airdropped 2 SOL');
  }

  // Use @solana/spl-token via dynamic import
  const spl = await import('@solana/spl-token');
  const dest = new PublicKey(toAddress);

  // Create tUSDT mint
  console.log('\nCreating tUSDT SPL token...');
  const usdtMint = await spl.createMint(conn, deployer, deployer.publicKey, null, 6);
  console.log(`tUSDT mint: ${usdtMint.toBase58()}`);

  // Create tUSDC mint
  console.log('Creating tUSDC SPL token...');
  const usdcMint = await spl.createMint(conn, deployer, deployer.publicKey, null, 6);
  console.log(`tUSDC mint: ${usdcMint.toBase58()}`);

  // Create ATAs + mint
  console.log(`\nMinting 1000 tUSDT to ${toAddress}...`);
  const usdtAta = await spl.getOrCreateAssociatedTokenAccount(conn, deployer, usdtMint, dest);
  await spl.mintTo(conn, deployer, usdtMint, usdtAta.address, deployer, 1000n * 10n ** 6n);

  console.log(`Minting 1000 tUSDC to ${toAddress}...`);
  const usdcAta = await spl.getOrCreateAssociatedTokenAccount(conn, deployer, usdcMint, dest);
  await spl.mintTo(conn, deployer, usdcMint, usdcAta.address, deployer, 1000n * 10n ** 6n);

  const deployed = loadDeployed();
  deployed.sol = {
    usdt: usdtMint.toBase58(),
    usdc: usdcMint.toBase58(),
    deployer: deployer.publicKey.toBase58(),
    mintedTo: toAddress,
  };
  saveDeployed(deployed);

  console.log('\n--- SOL Done ---');
  console.log(`tUSDT mint: ${usdtMint.toBase58()}`);
  console.log(`tUSDC mint: ${usdcMint.toBase58()}`);
  console.log(`Minted 1000 each to ${toAddress}`);

  return { usdt: usdtMint.toBase58(), usdc: usdcMint.toBase58() };
}

// --- CLI ---
function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

const chain = getArg('--chain') ?? 'all';
const toBnb = getArg('--to-bnb') ?? getArg('--to') ?? '';
const toSol = getArg('--to-sol') ?? getArg('--to') ?? '';

if (!toBnb && !toSol) {
  console.log('Usage:');
  console.log('  tsx scripts/deploy-test-tokens.ts --chain bnb --to 0xADDRESS');
  console.log('  tsx scripts/deploy-test-tokens.ts --chain sol --to <base58>');
  console.log('  tsx scripts/deploy-test-tokens.ts --chain all --to-bnb 0x... --to-sol <base58>');
  process.exit(1);
}

(async () => {
  if ((chain === 'bnb' || chain === 'all') && toBnb) {
    await deployBnbTokens(toBnb);
  }
  if ((chain === 'sol' || chain === 'all') && toSol) {
    await deploySolTokens(toSol);
  }
  console.log('\nDeployed tokens saved to .deployed-tokens.json');
})();
