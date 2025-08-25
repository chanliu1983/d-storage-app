import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  ComputeBudgetProgram,
  SystemProgram,
  type BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";
import type { SendTransactionOptions } from "@solana/wallet-adapter-base";
import {
  Program,
  AnchorProvider,
  BN,
  type Wallet as AnchorWallet,
} from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { FlexibleTokenExchange } from "../types/flexible_token_exchange";
import idl from "../idl/flexible_token_exchange.json";
import { tokenRegistry, type TokenInfo } from "./tokenRegistry";
// TokenRegistry is already imported as tokenRegistry instance

// Narrow wallet-related types to avoid using any
type SendTransactionFn = (
  tx: Transaction,
  connection: Connection,
  options?: SendTransactionOptions
) => Promise<string>;
type SignTransactionFn = (tx: Transaction) => Promise<Transaction>;
type SignAllTransactionsFn = (txs: Transaction[]) => Promise<Transaction[]>;
// Added type alias for injected/non-standard providers to fix linter and typing
type ProviderLike = {
  signAndSendTransaction?: (tx: Transaction) => Promise<string>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
};

interface MinimalWalletLike {
  publicKey: PublicKey | null;
  sendTransaction?: SendTransactionFn;
  signTransaction?: SignTransactionFn;
  signAllTransactions?: SignAllTransactionsFn;
}

type WalletInput = Partial<MinimalWalletLike> & {
  adapter?: Partial<MinimalWalletLike>;
};

const PROGRAM_ID = new PublicKey((idl as FlexibleTokenExchange).address);

export interface ExchangeToken {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  totalValue: number;
  price: number;
  change24h: number;
  decimals: number;
}

export interface ExchangeTransaction {
  id: string;
  type: "buy" | "sell";
  user: string;
  token: string;
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
  signature: string;
}

export interface ExchangeStats {
  totalValue: number;
  totalUsers: number;
  dailyVolume: number;
  totalTransactions: number;
}

export interface PoolData {
  tokenReserve: BN;
  solReserve: BN;
  lpSupply: BN;
  feeRate: number;
  tokenMint: PublicKey;
  isInitialized: boolean;
}

class BlockchainDataService {
  private connection: Connection;
  private tokenCache = new Map<string, TokenInfo>();
  private poolCache = new Map<string, PoolData | null>();
  private lastCacheUpdate = 0;
  private readonly CACHE_DURATION = 30 * 1000; // 30 seconds

  constructor(connection: Connection) {
    this.connection = connection;
  }

  private createWalletAdapter(wallet?: WalletInput): MinimalWalletLike {
    if (!wallet) {
      // For read-only operations, return a minimal wallet adapter
      return {
        publicKey: null,
        signTransaction: undefined,
        signAllTransactions: undefined,
        sendTransaction: undefined,
      };
    }

    // Some callers pass WalletContextState.wallet (which wraps an adapter), others may pass the context itself, or the adapter directly
    const maybeAdapter: Partial<MinimalWalletLike> | undefined =
      wallet.adapter ?? wallet;

    // Determine publicKey from any available layer
    const detectedPublicKey: PublicKey | null =
      wallet.publicKey ?? maybeAdapter?.publicKey ?? null;

    // Detect context-level and adapter-level functions separately
    const hasContextSend = typeof wallet.sendTransaction === "function";
    const hasAdapterSend = typeof maybeAdapter?.sendTransaction === "function";
    const sendTx: SendTransactionFn | undefined = hasContextSend
      ? (wallet.sendTransaction as SendTransactionFn) // use as-is; context function doesn't rely on this binding
      : hasAdapterSend
      ? (() => {
          const send = maybeAdapter!.sendTransaction as SendTransactionFn;
          return (tx: Transaction, connection: Connection, options?: SendTransactionOptions) =>
            send.call(maybeAdapter, tx, connection, options);
        })()
      : undefined;

    const hasContextSign = typeof wallet.signTransaction === "function";
    const signTx: SignTransactionFn | undefined = hasContextSign
      ? (wallet.signTransaction as SignTransactionFn) // use as-is
      : typeof maybeAdapter?.signTransaction === "function"
      ? (() => {
          const sign = maybeAdapter!.signTransaction as SignTransactionFn;
          return (tx: Transaction) => sign.call(maybeAdapter, tx);
        })()
      : undefined;

    const hasContextSignAll = typeof wallet.signAllTransactions === "function";
    const signAllTx: SignAllTransactionsFn | undefined = hasContextSignAll
      ? (wallet.signAllTransactions as SignAllTransactionsFn) // use as-is
      : typeof maybeAdapter?.signAllTransactions === "function"
      ? (() => {
          const signAll = maybeAdapter!
            .signAllTransactions as SignAllTransactionsFn;
          return (txs: Transaction[]) => signAll.call(maybeAdapter, txs);
        })()
      : undefined;

    console.log("Wallet capabilities:", {
      supportsSign: typeof signTx === "function",
      supportsSignAll: typeof signAllTx === "function",
      supportsSend: typeof sendTx === "function",
    });

    return {
      publicKey: detectedPublicKey,
      signTransaction: signTx,
      signAllTransactions: signAllTx,
      sendTransaction: sendTx,
    };
  }

  // Helper to detect any injected provider capable of signing/sending transactions
  private getInjectedProvider(): ProviderLike | undefined {
    const glob = globalThis as unknown as { window?: Record<string, unknown> };
    const w = (glob.window ??
      (globalThis as Record<string, unknown>)) as Record<string, unknown>;

    const candidates: Array<ProviderLike | undefined> = [];

    const maybeSolana = w.solana as ProviderLike | undefined;
    const maybePhantom =
      typeof w.phantom === "object" && w.phantom
        ? ((w.phantom as Record<string, unknown>)["solana"] as
            | ProviderLike
            | undefined)
        : undefined;
    const maybeBackpack =
      typeof w.backpack === "object" && w.backpack
        ? ((w.backpack as Record<string, unknown>)["solana"] as
            | ProviderLike
            | undefined)
        : undefined;
    const maybeXnft =
      typeof w.xnft === "object" && w.xnft
        ? ((w.xnft as Record<string, unknown>)["solana"] as
            | ProviderLike
            | undefined)
        : undefined;
    const maybeSolflare = w.solflare as ProviderLike | undefined;
    const maybeGlow = w.glowSolana as ProviderLike | undefined;
    const maybeSlope = w.Slope as ProviderLike | undefined;

    candidates.push(
      maybeSolana,
      maybePhantom,
      maybeBackpack,
      maybeXnft,
      maybeSolflare,
      maybeGlow,
      maybeSlope
    );

    // As a last resort, scan window keys for an object with desired methods
    for (const key of Object.keys(w)) {
      const val = w[key];
      if (val && typeof val === "object") {
        const injected = val as ProviderLike;
        if (
          typeof injected.signAndSendTransaction === "function" ||
          typeof injected.signTransaction === "function"
        ) {
          candidates.push(injected);
        }
      }
    }

    return candidates.find(
      (p) =>
        p &&
        (typeof p.signAndSendTransaction === "function" ||
          typeof p.signTransaction === "function")
    );
  }

  private initializeProgram(
    wallet?: WalletInput
  ): Program<FlexibleTokenExchange> {
    // Create a wallet adapter that includes the required methods for AnchorProvider
    const walletAdapter = this.createWalletAdapter(wallet);

    // For read-only operations, we can use a provider without a wallet
    const provider = new AnchorProvider(
      this.connection,
      walletAdapter as unknown as AnchorWallet,
      {
        commitment: "confirmed",
      }
    );
    return new Program<FlexibleTokenExchange>(
      idl as FlexibleTokenExchange,
      provider
    );
  }

  async getExchangeTokens(wallet?: WalletInput): Promise<ExchangeToken[]> {
    try {
      const program = this.initializeProgram(wallet);
      const exchangeTokens: ExchangeToken[] = [];

      // Get popular tokens from registry
      const popularTokens = await tokenRegistry.getPopularTokens();

      // For each popular token, check if there's a liquidity pool
      for (const token of popularTokens.slice(0, 10)) {
        // Limit to first 10 for performance
        try {
          const tokenMint = new PublicKey(token.mint);
          const poolData = await this.getPoolData(program, tokenMint);

          if (poolData && poolData.isInitialized) {
            // Calculate price based on pool reserves
            const tokenReserveNumber =
              poolData.tokenReserve.toNumber() / Math.pow(10, token.decimals);
            const solReserveNumber =
              poolData.solReserve.toNumber() / LAMPORTS_PER_SOL;

            const price =
              tokenReserveNumber > 0
                ? solReserveNumber / tokenReserveNumber
                : 0;
            const balance = tokenReserveNumber;
            const totalValue = balance * price;

            exchangeTokens.push({
              mint: token.mint,
              symbol: token.symbol,
              name: token.name,
              balance,
              totalValue,
              price,
              change24h: Math.random() * 10 - 5, // TODO: Calculate real 24h change
              decimals: token.decimals,
            });
          }
        } catch (error) {
          console.warn(`Error fetching pool data for ${token.symbol}:`, error);
        }
      }

      return exchangeTokens;
    } catch (error) {
      console.error("Error fetching exchange tokens:", error);
      return this.getFallbackExchangeTokens();
    }
  }

  private async getPoolData(
    program: Program<FlexibleTokenExchange>,
    tokenMint: PublicKey
  ): Promise<PoolData | null> {
    const cacheKey = tokenMint.toString();
    const now = Date.now();

    // Check cache first
    if (
      this.poolCache.has(cacheKey) &&
      now - this.lastCacheUpdate < this.CACHE_DURATION
    ) {
      return this.poolCache.get(cacheKey)!;
    }

    try {
      const [poolPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenMint.toBytes()],
        PROGRAM_ID
      );

      const poolAccount = await program.account.liquidityPool.fetch(poolPDA);

      const poolData: PoolData = {
        tokenReserve: poolAccount.tokenReserve,
        solReserve: poolAccount.solReserve,
        lpSupply: poolAccount.lpSupply,
        feeRate: poolAccount.feeRate,
        tokenMint: poolAccount.tokenMint,
        isInitialized: true, // Pool exists, so it's initialized
      };

      // Cache the result
      this.poolCache.set(cacheKey, poolData);
      this.lastCacheUpdate = now;

      return poolData;
    } catch (error) {
      // Only log if it's not a "Account does not exist" error, which is expected for tokens without pools
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('Account does not exist')) {
        console.warn(`Pool fetch error for token ${tokenMint.toString()}:`, error);
      }
      // Cache null result to avoid repeated failed fetches
      this.poolCache.set(cacheKey, null);
      return null;
    }
  }

  async getRecentTransactions(
    wallet?: WalletInput
  ): Promise<ExchangeTransaction[]> {
    try {
      this.initializeProgram(wallet);
      const transactions: ExchangeTransaction[] = [];

      // Get recent swap events from the program
      // Note: This is a simplified implementation
      // In a real app, you'd want to use event listeners or transaction history APIs

      // For now, we'll return empty array as we need to implement event parsing
      // TODO: Implement proper transaction history fetching

      return transactions;
    } catch (error) {
      console.error("Error fetching recent transactions:", error);
      return this.getFallbackTransactions();
    }
  }

  async getExchangeStats(wallet?: WalletInput): Promise<ExchangeStats> {
    try {
      const exchangeTokens = await this.getExchangeTokens(wallet);

      const totalValue = exchangeTokens.reduce(
        (sum, token) => sum + token.totalValue,
        0
      );

      // Calculate daily volume from recent transactions
      const recentTransactions = await this.getRecentTransactions(wallet);
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const dailyVolume = recentTransactions
        .filter((tx) => tx.timestamp > oneDayAgo)
        .reduce((sum, tx) => sum + tx.solAmount, 0);

      return {
        totalValue,
        totalUsers: 0, // TODO: Calculate from unique wallet addresses
        dailyVolume,
        totalTransactions: recentTransactions.length,
      };
    } catch (error) {
      console.error("Error calculating exchange stats:", error);
      return {
        totalValue: 0,
        totalUsers: 0,
        dailyVolume: 0,
        totalTransactions: 0,
      };
    }
  }

  // Check if a token has an existing liquidity pool
  async hasLiquidityPool(
    tokenMint: string,
    wallet?: WalletInput
  ): Promise<boolean> {
    try {
      const program = this.initializeProgram(wallet);
      const tokenMintPubkey = new PublicKey(tokenMint);
      const poolData = await this.getPoolData(program, tokenMintPubkey);
      return poolData !== null;
    } catch (error) {
      console.warn(`Error checking pool for token ${tokenMint}:`, error);
      return false;
    }
  }

  // Filter tokens that have existing liquidity pools
  async getTokensWithPools(
    tokens: Array<{ mint: string; symbol: string }>,
    wallet?: WalletInput
  ): Promise<Array<{ mint: string; symbol: string }>> {
    const tokensWithPools: Array<{ mint: string; symbol: string }> = [];

    for (const token of tokens) {
      // Always include SOL as it's the base trading pair
      if (token.mint === "SOL" || token.symbol === "SOL") {
        tokensWithPools.push(token);
        continue;
      }

      const hasPool = await this.hasLiquidityPool(token.mint, wallet);
      if (hasPool) {
        tokensWithPools.push(token);
      }
    }

    return tokensWithPools;
  }

  async getUserTokenBalances(
    publicKey: PublicKey,
    wallet?: WalletInput
  ): Promise<ExchangeToken[]> {
    try {
      const userTokens: ExchangeToken[] = [];

      // Get SOL balance and add it to the tokens array
      const solBalance = await this.connection.getBalance(publicKey);
      const solBalanceInSol = solBalance / LAMPORTS_PER_SOL;

      // Add SOL to the user tokens array
      userTokens.push({
        mint: "SOL",
        symbol: "SOL",
        name: "Solana",
        balance: solBalanceInSol,
        totalValue: solBalanceInSol, // SOL price is 1 SOL = 1 SOL
        price: 1,
        change24h: 0, // TODO: Get real SOL price change
        decimals: 9,
      });

      // Get ALL SPL token accounts owned by the user
      const TOKEN_PROGRAM_ID = new PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      );
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        publicKey,
        {
          programId: TOKEN_PROGRAM_ID,
        }
      );

      // Get popular tokens for metadata lookup
      const popularTokens = await tokenRegistry.getPopularTokens();
      const tokenMetadataMap = new Map<string, TokenInfo>();
      popularTokens.forEach((token) => {
        tokenMetadataMap.set(token.mint, token);
      });

      // Initialize program if wallet is provided (for pool data)
      let program: Program<FlexibleTokenExchange> | null = null;
      if (wallet) {
        try {
          program = this.initializeProgram(wallet);
        } catch (error) {
          console.warn("Could not initialize program for pool data:", error);
        }
      }

      // Process each token account
      for (const tokenAccountInfo of tokenAccounts.value) {
        try {
          const tokenAccount = await this.connection.getTokenAccountBalance(
            tokenAccountInfo.pubkey
          );

          if (tokenAccount.value.uiAmount && tokenAccount.value.uiAmount > 0) {
            // Parse the token account data to get the mint
            const accountData = tokenAccountInfo.account.data as Buffer;
            const mintBytes = accountData.slice(0, 32);
            const mintAddress = new PublicKey(mintBytes).toString();

            // Check if we have metadata for this token
            const tokenMetadata = tokenMetadataMap.get(mintAddress);

            let symbol: string, name: string, decimals: number;
            if (tokenMetadata) {
              symbol = tokenMetadata.symbol;
              name = tokenMetadata.name;
              decimals = tokenMetadata.decimals;
            } else {
              // For tokens without metadata, use mint address
              const shortMint = `${mintAddress.slice(
                0,
                4
              )}...${mintAddress.slice(-4)}`;
              symbol = shortMint;
              name = `Token ${shortMint}`;
              decimals = tokenAccount.value.decimals || 6; // Default to 6 decimals
            }

            // Get price from pool data if available
            let price = 0;
            if (program) {
              try {
                const tokenMint = new PublicKey(mintAddress);
                const poolData = await this.getPoolData(program, tokenMint);
                if (poolData && poolData.tokenReserve && poolData.solReserve) {
                  const tokenReserveNumber =
                    poolData.tokenReserve.toNumber() / Math.pow(10, decimals);
                  const solReserveNumber =
                    poolData.solReserve.toNumber() / LAMPORTS_PER_SOL;
                  price =
                    tokenReserveNumber > 0
                      ? solReserveNumber / tokenReserveNumber
                      : 0;
                }
              } catch (poolError) {
                // Pool doesn't exist or other error - price remains 0
                console.debug(
                  `No pool data for token ${mintAddress}:`,
                  poolError
                );
              }
            }

            userTokens.push({
              mint: mintAddress,
              symbol,
              name,
              balance: tokenAccount.value.uiAmount,
              totalValue: tokenAccount.value.uiAmount * price,
              price,
              change24h: Math.random() * 10 - 5, // TODO: Calculate real 24h change
              decimals,
            });
          }
        } catch (error) {
          console.warn("Error processing token account:", error);
          // Continue with next token account
        }
      }

      return userTokens;
    } catch (error) {
      console.error("Error fetching user token balances:", error);
      return [];
    }
  }

  private getFallbackExchangeTokens(): ExchangeToken[] {
    return [
      {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        symbol: "USDC",
        name: "USD Coin",
        balance: 0,
        totalValue: 0,
        price: 0.000025,
        change24h: 0.1,
        decimals: 6,
      },
    ];
  }

  private getFallbackTransactions(): ExchangeTransaction[] {
    return [];
  }

  // Execute a real SOL to Token swap
  async executeSwap(
    tokenMint: string,
    solAmount: number,
    minTokenAmount: number,
    wallet: WalletInput,
    publicKey: PublicKey
  ): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
    tokensReceived?: number;
    actualTokensReceived?: number;
    expectedTokensReceived?: number;
  }> {
    let latestBlockhash: BlockhashWithExpiryBlockHeight; // Declare at function scope for transaction confirmation
     
     try {
       // Validate wallet connection
       if (!wallet || !publicKey) {
         throw new Error("Wallet not connected or missing publicKey");
       }

      const program = this.initializeProgram(wallet);
      const tokenMintPubkey = new PublicKey(tokenMint);
      const userPublicKey = publicKey;

      // Get token metadata to determine correct decimals
      const tokenMetadata = await tokenRegistry.getTokenMetadata(this.connection, tokenMint);
      const tokenDecimals = tokenMetadata?.decimals || 9; // Default to 9 if not found
      
      console.log(`Token ${tokenMint} has ${tokenDecimals} decimals`);
      
      // Convert SOL amount to lamports
      const solAmountLamports = new BN(solAmount * LAMPORTS_PER_SOL);
      const minTokenAmountBN = new BN(minTokenAmount * Math.pow(10, tokenDecimals));
      
      // Debug logs for slippage calculation
      console.log('=== Swap Debug Information ===');
      console.log('1. solAmount (raw):', solAmount);
      console.log('2. minTokenAmount (raw):', minTokenAmount);
      console.log('3. tokenDecimals:', tokenDecimals);
      console.log('4. solAmountLamports:', solAmountLamports.toString());
      console.log('5. minTokenAmountBN:', minTokenAmountBN.toString());
      console.log('6. minTokenAmountBN as string:', minTokenAmountBN.toString());
      console.log('7. Decimal multiplier used:', Math.pow(10, tokenDecimals));
      console.log('==============================');

      // Calculate all required PDAs
      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      const [poolAuthorityPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_authority"), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      const [tokenVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault"), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_vault"), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      // Calculate user's associated token account using SPL token helper
      const TOKEN_PROGRAM_ID = new PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      );

      const userTokenAccountPda = await getAssociatedTokenAddress(
        tokenMintPubkey,
        userPublicKey
      );

      // Check if user's token account exists, create if it doesn't
      let needsTokenAccountCreation = false;
      try {
        const accountInfo = await this.connection.getAccountInfo(
          userTokenAccountPda
        );
        if (!accountInfo) {
          console.log("User token account does not exist, will create it...");
          needsTokenAccountCreation = true;
        } else {
          console.log("User token account already exists");
        }
      } catch (error) {
        console.warn("Could not check token account existence:", error);
        needsTokenAccountCreation = true; // Assume we need to create it
      }

      // Create token account if needed
      if (needsTokenAccountCreation) {
        try {
          console.log("Creating associated token account...");
          const createAccountIx = createAssociatedTokenAccountInstruction(
            userPublicKey, // payer
            userTokenAccountPda, // associated token account
            userPublicKey, // owner
            tokenMintPubkey // mint
          );

          const createAccountTx = new Transaction().add(createAccountIx);
          const walletAdapter = this.createWalletAdapter(wallet);

          // Prefer context-level sendTransaction if available, else use adapter with fallback
          let createAccountSig: string;
          const ctxSend = wallet?.sendTransaction;
          console.log("Token account creation path - capabilities:", {
            hasContextSend: typeof ctxSend,
            adapterSend: typeof walletAdapter.sendTransaction,
            adapterSign: typeof walletAdapter.signTransaction,
            adapterSignAll: typeof walletAdapter.signAllTransactions,
            injectedAvailable: this.getInjectedProvider() !== undefined,
          });
          if (typeof ctxSend === "function") {
            createAccountSig = await ctxSend(createAccountTx, this.connection);
          } else if (typeof walletAdapter.sendTransaction === "function") {
            createAccountSig = await walletAdapter.sendTransaction(
              createAccountTx,
              this.connection
            );
          } else if (typeof walletAdapter.signTransaction === "function") {
            const { blockhash } = await this.connection.getLatestBlockhash(
              "confirmed"
            );
            createAccountTx.feePayer = userPublicKey;
            createAccountTx.recentBlockhash = blockhash;
            const signedTx = await walletAdapter.signTransaction(
              createAccountTx
            );
            createAccountSig = await this.connection.sendRawTransaction(
              signedTx.serialize()
            );
          } else if (typeof walletAdapter.signAllTransactions === "function") {
            const { blockhash } = await this.connection.getLatestBlockhash(
              "confirmed"
            );
            createAccountTx.feePayer = userPublicKey;
            createAccountTx.recentBlockhash = blockhash;
            const [signedTx] = await walletAdapter.signAllTransactions([
              createAccountTx,
            ]);
            createAccountSig = await this.connection.sendRawTransaction(
              signedTx.serialize()
            );
          } else {
            // Try adapter's own signAndSendTransaction/signTransaction if present (non-standard)
            const adapterCandidate: unknown =
              (wallet as { adapter?: unknown } | undefined)?.adapter ??
              (wallet as unknown);
            const hasSignAndSend =
              typeof (adapterCandidate as { signAndSendTransaction?: unknown })
                .signAndSendTransaction === "function";
            const hasSignOnly =
              typeof (adapterCandidate as { signTransaction?: unknown })
                .signTransaction === "function";
            if (hasSignAndSend) {
              const { blockhash } = await this.connection.getLatestBlockhash(
                "confirmed"
              );
              createAccountTx.feePayer = userPublicKey;
              createAccountTx.recentBlockhash = blockhash;
              createAccountSig = await (adapterCandidate as ProviderLike)
                .signAndSendTransaction!(createAccountTx);
            } else if (hasSignOnly) {
              const { blockhash } = await this.connection.getLatestBlockhash(
                "confirmed"
              );
              createAccountTx.feePayer = userPublicKey;
              createAccountTx.recentBlockhash = blockhash;
              const signedTx = await (adapterCandidate as ProviderLike)
                .signTransaction!(createAccountTx);
              createAccountSig = await this.connection.sendRawTransaction(
                signedTx.serialize()
              );
            } else {
              // Try injected provider (e.g., window.solana, phantom.solana, backpack.solana, solflare)
              const injected = this.getInjectedProvider();
              if (
                injected &&
                typeof injected.signAndSendTransaction === "function"
              ) {
                const { blockhash } = await this.connection.getLatestBlockhash(
                  "confirmed"
                );
                createAccountTx.feePayer = userPublicKey;
                createAccountTx.recentBlockhash = blockhash;
                createAccountSig = await injected.signAndSendTransaction(
                  createAccountTx
                );
              } else if (
                injected &&
                typeof injected.signTransaction === "function"
              ) {
                const { blockhash } = await this.connection.getLatestBlockhash(
                  "confirmed"
                );
                createAccountTx.feePayer = userPublicKey;
                createAccountTx.recentBlockhash = blockhash;
                const signedTx = await injected.signTransaction(
                  createAccountTx
                );
                createAccountSig = await this.connection.sendRawTransaction(
                  signedTx.serialize()
                );
              } else {
                console.error(
                  "No available send/sign method for token account creation. Wallet param keys:",
                  Object.keys(wallet || {})
                );
                throw new Error(
                  "Wallet adapter does not support sending transactions"
                );
              }
            }
          }
          await this.connection.confirmTransaction(
            createAccountSig,
            "confirmed"
          );
          console.log("Token account created successfully:", createAccountSig);
        } catch (createError) {
          console.error("Failed to create token account:", createError);
          // Continue anyway - the swap instruction might handle creation
        }
      }

      const SYSTEM_PROGRAM_ID = new PublicKey(
        "11111111111111111111111111111111"
      );

      // Execute the swap
      console.log("Executing swap with accounts:", {
        pool: poolPda.toString(),
        user: userPublicKey.toString(),
        userTokenAccount: userTokenAccountPda.toString(),
        poolAuthority: poolAuthorityPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        solVault: solVaultPda.toString(),
        tokenProgram: TOKEN_PROGRAM_ID.toString(),
        systemProgram: SYSTEM_PROGRAM_ID.toString(),
      });

      // Fetch and log pool data for debugging
      let poolAccount;
      try {
        poolAccount = await program.account.liquidityPool.fetch(poolPda);
        console.log('Pool data before swap:', {
          feeRate: poolAccount.feeRate,
          tokenReserve: poolAccount.tokenReserve.toString(),
          solReserve: poolAccount.solReserve.toString(),
          poolAuthority: poolAccount.poolAuthority.toString(),
          tokenMint: poolAccount.tokenMint.toString(),
          tokenVault: poolAccount.tokenVault.toString(),
          solVault: poolAccount.solVault.toString()
        });
        
        // Validate fee rate before attempting swap
        if (poolAccount.feeRate > 1000) {
          console.error(`Invalid fee rate detected: ${poolAccount.feeRate} (max allowed: 1000)`);
          throw new Error(`Pool has invalid fee rate: ${poolAccount.feeRate} basis points (max allowed: 1000)`);
        }
      } catch (poolFetchError) {
        console.error('Failed to fetch pool data:', poolFetchError);
        throw new Error(`Failed to fetch pool data: ${poolFetchError}`);
      }

      let signature: string | undefined = undefined;
      try {
        // Build the transaction
        const transaction = await program.methods
          .swapSolToToken(solAmountLamports, minTokenAmountBN)
          .accountsPartial({
            pool: poolPda,
            user: userPublicKey,
            userTokenAccount: userTokenAccountPda,
            tokenVault: tokenVaultPda,
            solVault: solVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SYSTEM_PROGRAM_ID,
          })
          .transaction();

        // Add compute budget instructions to improve reliability and priority fees
        try {
          transaction.instructions.unshift(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 })
          );
          transaction.instructions.unshift(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 })
          );
          console.log('Added ComputeBudget instructions');
        } catch (e) {
          console.warn('Failed to add compute budget instructions:', e);
        }

        // Robust transaction sending with retry logic and fallback methods
        const walletAdapter = this.createWalletAdapter(wallet);
        const ctxSend = wallet?.sendTransaction;
        console.log("Send path capabilities:", {
          ctxSend: typeof ctxSend,
          adapterSend: typeof walletAdapter.sendTransaction,
          adapterSign: typeof walletAdapter.signTransaction,
          adapterSignAll: typeof walletAdapter.signAllTransactions,
        });

        let retryCount = 0;
        const maxRetries = 3;
        latestBlockhash = await this.connection.getLatestBlockhash("confirmed");

        while (retryCount < maxRetries) {
          try {
            // Try different sending options based on retry count
            const sendOptions = retryCount === 0 ? {
              skipPreflight: false,
              preflightCommitment: 'confirmed' as const,
              maxRetries: 1
            } : {
              skipPreflight: true, // Skip preflight on retries
              preflightCommitment: 'confirmed' as const,
              maxRetries: 1
            };

            // Set transaction properties
            transaction.feePayer = userPublicKey;
            transaction.recentBlockhash = latestBlockhash.blockhash;

            // Try primary sending methods
            if (typeof ctxSend === "function") {
              signature = await ctxSend(transaction, this.connection, sendOptions);
            } else if (typeof walletAdapter.sendTransaction === "function") {
              signature = await walletAdapter.sendTransaction(
                transaction,
                this.connection,
                sendOptions
              );
            } else {
              // Fallback to sign + send raw transaction
              let signedTx;
              if (typeof walletAdapter.signTransaction === "function") {
                signedTx = await walletAdapter.signTransaction(transaction);
              } else if (typeof walletAdapter.signAllTransactions === "function") {
                const [signed] = await walletAdapter.signAllTransactions([transaction]);
                signedTx = signed;
              } else {
                // Try adapter's own methods
                const adapterCandidate: unknown =
                  (wallet as { adapter?: unknown } | undefined)?.adapter ??
                  (wallet as unknown);
                const hasSignAndSend =
                  typeof (adapterCandidate as { signAndSendTransaction?: unknown })
                    .signAndSendTransaction === "function";
                const hasSignOnly =
                  typeof (adapterCandidate as { signTransaction?: unknown })
                    .signTransaction === "function";
                
                if (hasSignAndSend) {
                  signature = await (adapterCandidate as ProviderLike)
                    .signAndSendTransaction!(transaction);
                  break;
                } else if (hasSignOnly) {
                  signedTx = await (adapterCandidate as ProviderLike)
                    .signTransaction!(transaction);
                } else {
                  // Try injected provider
                  const injected = this.getInjectedProvider();
                  if (injected && typeof injected.signAndSendTransaction === "function") {
                    signature = await injected.signAndSendTransaction(transaction);
                    break;
                  } else if (injected && typeof injected.signTransaction === "function") {
                    signedTx = await injected.signTransaction(transaction);
                  } else {
                    throw new Error("Wallet adapter does not support sending transactions");
                  }
                }
              }

              if (signedTx) {
                signature = await this.connection.sendRawTransaction(
                  signedTx.serialize(),
                  {
                    skipPreflight: sendOptions.skipPreflight,
                    preflightCommitment: sendOptions.preflightCommitment
                  }
                );
              }
            }

            if (signature) {
              console.log('Transaction sent successfully, signature:', signature);
              break;
            } else {
              throw new Error('Failed to obtain transaction signature');
            }

          } catch (sendError: unknown) {
            retryCount++;
            console.warn(`Transaction send attempt ${retryCount} failed:`, sendError);
            const sendErrorObj = sendError as Error & { name?: string; code?: number; stack?: string; error?: unknown; wallet?: unknown; transaction?: unknown };
            console.error('Send error details:', {
              name: sendErrorObj.name,
              message: sendErrorObj.message,
              code: sendErrorObj.code,
              stack: sendErrorObj.stack
            });

            // Don't retry for user rejection or certain wallet errors
            if (sendErrorObj.message?.includes('User rejected') || 
                sendErrorObj.message?.includes('rejected') ||
                sendErrorObj.message?.includes('denied') ||
                sendErrorObj.name === 'WalletNotConnectedError' ||
                sendErrorObj.code === 4001) { // User rejected request
              throw sendError;
            }

            // Handle specific wallet adapter errors
            if (sendErrorObj.name === 'WalletSendTransactionError') {
              console.error('WalletSendTransactionError details:', {
                originalError: sendErrorObj.error,
                wallet: sendErrorObj.wallet,
                transaction: sendErrorObj.transaction
              });

              // If it's an unexpected error, try alternative approach
              if (sendErrorObj.message?.includes('Unexpected error') && retryCount < maxRetries) {
                console.log('Trying alternative transaction sending approach...');
                
                try {
                  // Alternative: Sign transaction manually then send raw transaction
                  let signedTransaction;
                  if (typeof walletAdapter.signTransaction === "function") {
                    signedTransaction = await walletAdapter.signTransaction(transaction);
                  } else {
                    // Try other signing methods
                    const adapterCandidate: unknown =
                      (wallet as { adapter?: unknown } | undefined)?.adapter ??
                      (wallet as unknown);
                    if (typeof (adapterCandidate as { signTransaction?: unknown }).signTransaction === "function") {
                      signedTransaction = await (adapterCandidate as ProviderLike).signTransaction!(transaction);
                    } else {
                      const injected = this.getInjectedProvider();
                      if (injected && typeof injected.signTransaction === "function") {
                        signedTransaction = await injected.signTransaction(transaction);
                      } else {
                        throw new Error('No signing method available');
                      }
                    }
                  }
                  
                  const rawTransaction = signedTransaction.serialize();
                  signature = await this.connection.sendRawTransaction(rawTransaction, {
                    skipPreflight: retryCount > 0,
                    preflightCommitment: 'confirmed'
                  });
                  console.log('Alternative send method successful, signature:', signature);
                  break;
                } catch (altError: unknown) {
                  console.warn('Alternative send method also failed:', altError);
                  if (retryCount >= maxRetries) {
                    throw new Error(`Both standard and alternative transaction sending failed. Last error: ${altError instanceof Error ? altError.message : String(altError)}`);
                  }
                }
              } else if (retryCount >= maxRetries) {
                throw sendError;
              }
            } else if (retryCount >= maxRetries) {
              throw new Error(`Failed to send transaction after ${maxRetries} attempts: ${sendErrorObj.message}`);
            }

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            
            // Get fresh blockhash for retry
            latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
          }
        }

        if (!signature) {
          throw new Error('Failed to obtain transaction signature after all retry attempts');
        }
        console.log("Swap transaction signature:", signature);
      } catch (swapError: unknown) {
        console.error("Swap transaction failed:", swapError);

        // Provide more detailed error information if available
        if (
          typeof swapError === "object" &&
          swapError &&
          "message" in swapError
        ) {
          console.error(
            "Error message:",
            (swapError as { message?: string }).message
          );
        }
        if (typeof swapError === "object" && swapError && "logs" in swapError) {
          console.error(
            "Transaction logs:",
            (swapError as { logs?: unknown }).logs
          );
        }

        const msg =
          typeof swapError === "object" &&
          swapError &&
          "message" in swapError &&
          typeof (swapError as { message?: string }).message === "string"
            ? (swapError as { message: string }).message
            : "Unknown error";
        throw new Error(`Swap transaction failed: ${msg}`);
      }

      // Wait for confirmation with optimized timeout and fresh blockhash
      let confirmation;
      try {
        // Use the same blockhash that was used for the transaction
        if (!signature) {
          throw new Error('Cannot confirm transaction: no signature available');
        }
        
        // Get fresh blockhash for confirmation to ensure we have the latest block height
        const freshBlockhash = await this.connection.getLatestBlockhash('confirmed');
        
        const confirmationPromise = this.connection.confirmTransaction({
          signature: signature,
          blockhash: freshBlockhash.blockhash,
          lastValidBlockHeight: freshBlockhash.lastValidBlockHeight
        }, 'confirmed');
        
        // Reduce timeout to 30 seconds for faster failure detection
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000)
        );
        
        confirmation = await Promise.race([confirmationPromise, timeoutPromise]) as { value?: { err?: unknown } };
        console.log("Transaction confirmed:", confirmation);

        if (confirmation.value?.err) {
          console.error("Transaction failed on-chain:", confirmation.value.err);
          throw new Error(
            `Transaction failed on-chain: ${JSON.stringify(
              confirmation.value.err
            )}`
          );
        }
      } catch (confirmError: unknown) {
        console.error("Transaction confirmation failed:", confirmError);
        
        // Provide more detailed error information
        let errorMessage = "Unknown error";
        let errorDetails = "";
        let shouldRetry = false;
        
        if (typeof confirmError === "object" && confirmError) {
          if ("message" in confirmError && typeof (confirmError as { message?: string }).message === "string") {
            errorMessage = (confirmError as { message: string }).message;
          }
          
          // Check for specific error types
          if ("name" in confirmError) {
            const errorName = (confirmError as { name?: string }).name;
            if (errorName === "TransactionExpiredBlockheightExceededError") {
              errorDetails = " (Transaction expired - blockhash is too old)";
              shouldRetry = true;
            } else if (errorName === "TransactionExpiredTimeoutError") {
              errorDetails = " (Transaction confirmation timeout)";
              shouldRetry = true;
            } else if (errorName === "TransactionExpiredNonceInvalidError") {
              errorDetails = " (Transaction nonce is invalid)";
            }
          }
          
          // Log additional error properties for debugging
          if ("code" in confirmError || "logs" in confirmError || "err" in confirmError) {
            console.error("Additional error details:", {
              code: (confirmError as { code?: unknown }).code,
              logs: (confirmError as { logs?: unknown }).logs,
              err: (confirmError as { err?: unknown }).err
            });
          }
        }
        
        // Retry confirmation with fresh blockhash if it's a timeout or expired error
        if (shouldRetry) {
          console.log("Retrying transaction confirmation with fresh blockhash...");
          try {
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Get the latest blockhash for retry
            const retryBlockhash = await this.connection.getLatestBlockhash('confirmed');
            
            const retryConfirmationPromise = this.connection.confirmTransaction({
              signature: signature!,
              blockhash: retryBlockhash.blockhash,
              lastValidBlockHeight: retryBlockhash.lastValidBlockHeight
            }, 'confirmed');
            
            // Shorter timeout for retry
            const retryTimeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Retry confirmation timeout')), 20000)
            );
            
            confirmation = await Promise.race([retryConfirmationPromise, retryTimeoutPromise]) as { value?: { err?: unknown } };
            console.log("Transaction confirmed on retry:", confirmation);
            
            if (confirmation.value?.err) {
              console.error("Transaction failed on-chain (retry):", confirmation.value.err);
              throw new Error(
                `Transaction failed on-chain: ${JSON.stringify(
                  confirmation.value.err
                )}`
              );
            }
          } catch (retryError: unknown) {
            console.error("Retry confirmation also failed:", retryError);
            throw new Error(`Transaction confirmation failed after retry: ${errorMessage}${errorDetails}`);
          }
        } else {
          throw new Error(`Transaction confirmation failed: ${errorMessage}${errorDetails}`);
        }
      }

      // Verify the swap by checking the actual token balance
      let actualTokensReceived = 0;
      try {
        console.log("Verifying token balance after swap...");
        const tokenAccountInfo = await this.connection.getTokenAccountBalance(
          userTokenAccountPda
        );
        actualTokensReceived = parseInt(tokenAccountInfo.value.amount);
        console.log("Actual tokens received:", actualTokensReceived);

        if (actualTokensReceived === 0) {
          console.warn(
            "Warning: Token balance is still 0 after swap. Transaction may have failed."
          );
        }
      } catch (balanceError: unknown) {
        console.error("Failed to verify token balance:", balanceError);
        // Fall back to calculation if we can't read the balance
      }

      // Calculate expected tokens received (for comparison)
      let expectedTokensReceived = 0;
      try {
        const poolData = await this.getPoolData(program, tokenMintPubkey);
        if (poolData) {
          const solReserve = poolData.solReserve.toNumber() / LAMPORTS_PER_SOL;
          const tokenReserve =
            poolData.tokenReserve.toNumber() / Math.pow(10, 6);

          // Simple AMM calculation: tokens_out = (sol_in * token_reserve) / (sol_reserve + sol_in)
          // Apply 0.3% fee
          const solInAfterFee = solAmount * 0.997;
          expectedTokensReceived =
            (solInAfterFee * tokenReserve) / (solReserve + solInAfterFee);
          console.log(
            "Expected tokens from calculation:",
            expectedTokensReceived
          );
        }
      } catch (poolError: unknown) {
        console.error("Failed to calculate expected tokens:", poolError);
      }

      const tokensReceived =
        actualTokensReceived > 0
          ? actualTokensReceived
          : expectedTokensReceived;

      return {
        success: true,
        signature,
        tokensReceived,
        actualTokensReceived,
        expectedTokensReceived,
      };
    } catch (error: unknown) {
      console.error("Error executing swap:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error occurred";
      return {
        success: false,
        error: message,
      };
    }
  }

  // ...
  async executeSwapTokenToSol(
    tokenMint: string,
    tokenAmount: number,
    minSolAmount: number,
    wallet: WalletInput,
    publicKey: PublicKey
  ): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
    solReceivedLamports?: number;
  }> {
    let latestBlockhash: BlockhashWithExpiryBlockHeight;
    try {
      if (!wallet || !publicKey) throw new Error("Wallet not connected or missing publicKey");

      const program = this.initializeProgram(wallet);
      const tokenMintPubkey = new PublicKey(tokenMint);
      const userPublicKey = publicKey;

      // Determine token decimals for amount conversion
      const tokenMetadata = await tokenRegistry.getTokenMetadata(this.connection, tokenMint);
      const tokenDecimals = tokenMetadata?.decimals || 9;

      // Convert amounts
      const tokenAmountBN = new BN(tokenAmount * Math.pow(10, tokenDecimals));
      const minSolLamportsBN = new BN(minSolAmount * LAMPORTS_PER_SOL);

      console.log('=== Token -> SOL Swap Debug ===');
      console.log('tokenMint:', tokenMint);
      console.log('tokenAmount (raw):', tokenAmount);
      console.log('minSolAmount (SOL):', minSolAmount);
      console.log('tokenDecimals:', tokenDecimals);
      console.log('tokenAmountBN:', tokenAmountBN.toString());
      console.log('minSolLamportsBN:', minSolLamportsBN.toString());

      // Derive PDAs
      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );
      const [tokenVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("token_vault"), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );
      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("sol_vault"), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );
      
      // User token ATA (source of tokens)
      const userTokenAccountPda = await getAssociatedTokenAddress(
        tokenMintPubkey,
        userPublicKey
      );

      // Ensure user token account exists (cannot create here if user intends to spend tokens)
      const ataInfo = await this.connection.getAccountInfo(userTokenAccountPda);
      if (!ataInfo) {
        throw new Error('Associated token account does not exist for this token. Please create it and fund with tokens first.');
      }

      // Check user SOL balance for transaction fees
      const userAccountInfo = await this.connection.getAccountInfo(userPublicKey);
      const userSolBalance = userAccountInfo?.lamports || 0;
      const minimumSolForFees = 0.01 * LAMPORTS_PER_SOL; // Reserve 0.01 SOL for transaction fees
      
      if (userSolBalance < minimumSolForFees) {
        throw new Error(`Insufficient SOL balance for transaction fees. You need at least 0.01 SOL but have ${userSolBalance / LAMPORTS_PER_SOL} SOL.`);
      }
      
      console.log('User SOL balance check:', {
        userSolBalance: userSolBalance / LAMPORTS_PER_SOL,
        minimumRequired: minimumSolForFees / LAMPORTS_PER_SOL,
        sufficient: userSolBalance >= minimumSolForFees
      });

      // Fetch pool and validate
      let poolAccount;
      try {
        poolAccount = await program.account.liquidityPool.fetch(poolPda);
        console.log('Pool data before swap (Token->SOL):', {
          feeRate: poolAccount.feeRate,
          tokenReserve: poolAccount.tokenReserve.toString(),
          solReserve: poolAccount.solReserve.toString(),
          tokenMint: poolAccount.tokenMint.toString(),
          tokenVault: poolAccount.tokenVault.toString(),
          solVault: poolAccount.solVault.toString(),
          isInitialized: poolAccount.isInitialized
        });
        
        // Validate pool state
        if (!poolAccount.isInitialized) {
          throw new Error('Pool is not initialized');
        }
        if (poolAccount.feeRate > 1000) {
          throw new Error(`Pool has invalid fee rate: ${poolAccount.feeRate} basis points (max 1000)`);
        }
        if (poolAccount.tokenReserve.isZero() || poolAccount.solReserve.isZero()) {
          throw new Error('Pool has zero reserves - no liquidity available');
        }
      } catch (e) {
        console.error('Failed to fetch pool data:', e);
        throw new Error(`Failed to fetch pool data: ${e}`);
      }

      // Check sol vault balance to ensure it has enough SOL for the swap
      const solVaultInfo = await this.connection.getAccountInfo(solVaultPda, { commitment: 'confirmed' });
      const solVaultBalance = solVaultInfo?.lamports || 0;
      const solVaultOwner = solVaultInfo?.owner?.toBase58?.() || String(solVaultInfo?.owner);
      console.log('SOL Vault balance/owner check:', {
        solVault: solVaultPda.toBase58(),
        solVaultOwner,
        expectedProgramOwner: PROGRAM_ID.toBase58(),
        systemProgram: SystemProgram.programId.toBase58(),
        solVaultBalance: solVaultBalance / LAMPORTS_PER_SOL,
        minSolAmountNeeded: minSolAmount,
        sufficient: solVaultBalance >= minSolLamportsBN.toNumber()
      });
      
      if (solVaultBalance < minSolLamportsBN.toNumber()) {
        throw new Error(`Insufficient SOL in pool vault. Pool has ${solVaultBalance / LAMPORTS_PER_SOL} SOL but swap requires ${minSolAmount} SOL.`);
      }

      const TOKEN_PROGRAM_ID = new PublicKey(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      );
      const SYSTEM_PROGRAM_ID = new PublicKey(
        "11111111111111111111111111111111"
      );



      // Build transaction using accountsPartial to avoid type errors
      const transaction = await program.methods
        .swapTokenToSol(tokenAmountBN, minSolLamportsBN)
        .accountsPartial({
          pool: poolPda,
          user: userPublicKey,
          userTokenAccount: userTokenAccountPda,
          tokenVault: tokenVaultPda,
          solVault: solVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SYSTEM_PROGRAM_ID,
        })
        .transaction();

      // Compute budget tweaks
      try {
        transaction.instructions.unshift(
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000 })
        );
        transaction.instructions.unshift(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 })
        );
      } catch (e) {
        console.warn('Failed to add compute budget instructions:', e);
      }

      // Send with robust fallbacks
      const walletAdapter = this.createWalletAdapter(wallet);
      const ctxSend = wallet?.sendTransaction;
      let signature: string | undefined;
      const maxRetries = 3;
      latestBlockhash = await this.connection.getLatestBlockhash('confirmed');

      for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
        try {
          const sendOptions = retryCount === 0 ? {
            skipPreflight: false,
            preflightCommitment: 'confirmed' as const,
            maxRetries: 1,
          } : {
            skipPreflight: true,
            preflightCommitment: 'confirmed' as const,
            maxRetries: 1,
          };

          transaction.feePayer = userPublicKey;
          transaction.recentBlockhash = latestBlockhash.blockhash;

          if (typeof ctxSend === 'function') {
            signature = await ctxSend(transaction, this.connection, sendOptions);
          } else if (typeof walletAdapter.sendTransaction === 'function') {
            signature = await walletAdapter.sendTransaction(transaction, this.connection, sendOptions);
          } else {
            let signedTx;
            if (typeof walletAdapter.signTransaction === 'function') {
              signedTx = await walletAdapter.signTransaction(transaction);
            } else if (typeof walletAdapter.signAllTransactions === 'function') {
              const [signed] = await walletAdapter.signAllTransactions([transaction]);
              signedTx = signed;
            } else {
              const injected = this.getInjectedProvider();
              if (injected && typeof injected.signAndSendTransaction === 'function') {
                signature = await injected.signAndSendTransaction(transaction);
                break;
              } else if (injected && typeof injected.signTransaction === 'function') {
                const signed = await injected.signTransaction(transaction);
                signature = await this.connection.sendRawTransaction(signed.serialize(), {
                  skipPreflight: sendOptions.skipPreflight,
                  preflightCommitment: sendOptions.preflightCommitment,
                });
                break;
              } else {
                throw new Error('Wallet adapter does not support sending transactions');
              }
            }
            if (signedTx) {
              signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
                skipPreflight: sendOptions.skipPreflight,
                preflightCommitment: sendOptions.preflightCommitment,
              });
            }
          }

          if (!signature) throw new Error('Failed to obtain transaction signature');
          console.log('Token->SOL swap signature:', signature);
          // Success
          // Confirm
          const freshBlockhash = await this.connection.getLatestBlockhash('confirmed');
          const confirmation = await this.connection.confirmTransaction({
            signature,
            blockhash: freshBlockhash.blockhash,
            lastValidBlockHeight: freshBlockhash.lastValidBlockHeight,
          }, 'confirmed');
          console.log('Transaction confirmed:', confirmation);
          if (confirmation?.value?.err) {
            const errorStr = JSON.stringify(confirmation.value.err);
            console.error('Transaction failed on-chain:', errorStr);

            // Fetch and print program logs for diagnosis
            try {
              const tx = await this.connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
              });
              const logs = tx?.meta?.logMessages || [];
              console.group('Program logs');
              logs.forEach((l) => console.log(l));
              console.groupEnd();
            } catch (logErr) {
              console.warn('Failed to fetch transaction logs:', logErr);
            }
            
            // Parse custom error codes
            if (errorStr.includes('Custom')) {
              const customErrorMatch = errorStr.match(/"Custom":(\d+)/);
              if (customErrorMatch) {
                const errorCode = parseInt(customErrorMatch[1]);
                console.log('Custom error code detected:', errorCode);
                
                // Map known error codes
                switch (errorCode) {
                  case 2004:
                    throw new Error('Pool configuration error: Invalid fee rate detected. Please contact support.');
                  case 3012:
                    throw new Error('No liquidity pool exists for this token. Please create a liquidity pool first before attempting to swap.');
                  case 6000:
                    throw new Error('Slippage tolerance exceeded. Try increasing slippage or reducing swap amount.');
                  case 6001:
                    throw new Error('Insufficient liquidity in the pool for this swap amount.');
                  case 6005:
                    throw new Error('Pool has invalid fee rate configuration.');
                  default:
                    throw new Error(`Transaction failed with error code ${errorCode}. Please try again or contact support.`);
                }
              }
            }
            
            throw new Error(`Transaction failed on-chain: ${errorStr}`);
          }

          return { success: true, signature, solReceivedLamports: undefined };
        } catch (sendErr) {
          console.warn(`Token->SOL send attempt failed:`, sendErr);
          await new Promise(r => setTimeout(r, 800));
          latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
          if (sendErr instanceof Error && (
            sendErr.message.includes('User rejected') ||
            sendErr.message.includes('denied')
          )) {
            throw sendErr;
          }
          if (sendErr instanceof Error && sendErr.message.includes('Both standard and alternative')) {
            throw sendErr;
          }
          // continue retries
        }
      }

      throw new Error('Failed to send Token->SOL swap after retries');
    } catch (error) {
      console.error('Error executing Token->SOL swap:', error);
      const message = error instanceof Error
        ? error.message
        : 'Unknown error occurred';
      return { success: false, error: message };
    }
  }

  clearCache(): void {
    this.poolCache.clear();
    this.tokenCache.clear();
    this.lastCacheUpdate = 0;
  }
}

export default BlockchainDataService;
