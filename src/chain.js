// Chain operations for funding the desk's Telegraph escrow, on Ethereum
// Sepolia. The test USDC is Telegraph's own token: anyone can mint it, so the
// only prerequisite is a little Sepolia ETH for gas in the desk wallet.

import { createPublicClient, createWalletClient, defineChain, formatUnits, http, parseAbi, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

const escrowAbi = parseAbi([
  "function usdcToken() view returns (address)",
  "function depositUSDC(uint256 amount)",
]);
const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

export const sepolia = defineChain({
  id: config.chainId,
  name: "Ethereum Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

export function accountFromKey(key = config.privateKey) {
  if (!key) throw new Error("TELEGRAPH_PRIVATE_KEY is not set.");
  return privateKeyToAccount(key);
}

export function newWallet() {
  const privateKey = generatePrivateKey();
  return { privateKey, account: privateKeyToAccount(privateKey) };
}

export class Chain {
  constructor(cfg = config) {
    this.cfg = cfg;
    this.pub = createPublicClient({ chain: sepolia, transport: http(cfg.rpcUrl) });
  }

  async balances(address) {
    const [eth, usdc] = await Promise.all([
      this.pub.getBalance({ address }),
      this.pub.readContract({ address: this.cfg.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    ]);
    return { eth: Number(formatUnits(eth, 18)), usdc: Number(formatUnits(usdc, 6)) };
  }

  async #wait(hash, what) {
    const r = await this.pub.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${what} transaction reverted: ${hash}`);
    return hash;
  }

  /** Mint test USDC to the wallet, approve the diamond, deposit into escrow. */
  async fund(account, { mintUsd = 20, depositUsd = 5 } = {}) {
    const wallet = createWalletClient({ account, chain: sepolia, transport: http(this.cfg.rpcUrl) });
    const txs = [];
    let nonce = await this.pub.getTransactionCount({ address: account.address, blockTag: "pending" });

    const mintAmount = parseUnits(String(mintUsd), 6);
    txs.push(await this.#wait(
      await wallet.writeContract({ address: this.cfg.usdc, abi: erc20Abi, functionName: "mint", args: [account.address, mintAmount], nonce: nonce++ }),
      "mint",
    ));

    const amount = parseUnits(String(depositUsd), 6);
    const allowance = await this.pub.readContract({
      address: this.cfg.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, this.cfg.diamond],
    });
    if (allowance < amount) {
      txs.push(await this.#wait(
        await wallet.writeContract({ address: this.cfg.usdc, abi: erc20Abi, functionName: "approve", args: [this.cfg.diamond, amount], nonce: nonce++ }),
        "approve",
      ));
    }
    txs.push(await this.#wait(
      await wallet.writeContract({ address: this.cfg.diamond, abi: escrowAbi, functionName: "depositUSDC", args: [amount], nonce }),
      "depositUSDC",
    ));
    return { minted_usdc: mintUsd, deposited_usdc: depositUsd, transactions: txs };
  }
}
