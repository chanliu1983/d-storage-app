import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import type { FlexibleTokenExchange } from '../types/flexible_token_exchange';
import idl from '../idl/flexible_token_exchange.json';
import { tokenRegistry, type TokenInfo } from './tokenRegistry';

const PROGRAM_ID = new PublicKey(idl.address);

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
  type: 'buy' | 'sell';
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
  private poolCache = new Map<string, PoolData>();
  private lastCacheUpdate = 0;
  private readonly CACHE_DURATION = 30 * 1000; // 30 seconds

  constructor(connection: Connection) {
    this.connection = connection;
  }

  private createWalletAdapter(wallet: any) {
    if (!wallet || !wallet.publicKey) {
      // For read-only operations, return a minimal wallet adapter
      return {
        publicKey: null,
        signTransaction: undefined,
        signAllTransactions: undefined,
        sendTransaction: undefined
      };
    }

    // Check if the wallet supports signing
    const supportsSign = wallet.signTransaction && typeof wallet.signTransaction === 'function';
    const supportsSignAll = wallet.signAllTransactions && typeof wallet.signAllTransactions === 'function';
    const supportsSend = wallet.sendTransaction && typeof wallet.sendTransaction === 'function';

    console.log('Wallet capabilities:', { supportsSign, supportsSignAll, supportsSend });

    return {
      publicKey: wallet.publicKey,
      signTransaction: supportsSign ? wallet.signTransaction.bind(wallet) : undefined,
      signAllTransactions: supportsSignAll ? wallet.signAllTransactions.bind(wallet) : undefined,
      sendTransaction: supportsSend ? wallet.sendTransaction.bind(wallet) : undefined
    };
  }

  private initializeProgram(wallet?: any): Program<FlexibleTokenExchange> {
    // Create a wallet adapter that includes the required methods for AnchorProvider
    const walletAdapter = this.createWalletAdapter(wallet);

    // For read-only operations, we can use a provider without a wallet
    const provider = new AnchorProvider(this.connection, walletAdapter as any, {
      commitment: 'confirmed',
    });
    return new Program(idl as any, provider);
  }

  async getExchangeTokens(wallet?: any): Promise<ExchangeToken[]> {
    try {
      const program = this.initializeProgram(wallet);
      const exchangeTokens: ExchangeToken[] = [];
      
      // Get popular tokens from registry
      const popularTokens = await tokenRegistry.getPopularTokens();
      
      // For each popular token, check if there's a liquidity pool
      for (const token of popularTokens.slice(0, 10)) { // Limit to first 10 for performance
        try {
          const tokenMint = new PublicKey(token.mint);
          const poolData = await this.getPoolData(program, tokenMint);
          
          if (poolData && poolData.isInitialized) {
            // Calculate price based on pool reserves
            const tokenReserveNumber = poolData.tokenReserve.toNumber() / Math.pow(10, token.decimals);
            const solReserveNumber = poolData.solReserve.toNumber() / LAMPORTS_PER_SOL;
            
            const price = tokenReserveNumber > 0 ? solReserveNumber / tokenReserveNumber : 0;
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
              decimals: token.decimals
            });
          }
        } catch (error) {
          console.warn(`Error fetching pool data for ${token.symbol}:`, error);
        }
      }
      
      return exchangeTokens;
    } catch (error) {
      console.error('Error fetching exchange tokens:', error);
      return this.getFallbackExchangeTokens();
    }
  }

  private async getPoolData(program: Program<FlexibleTokenExchange>, tokenMint: PublicKey): Promise<PoolData | null> {
    const cacheKey = tokenMint.toString();
    const now = Date.now();
    
    // Check cache first
    if (this.poolCache.has(cacheKey) && (now - this.lastCacheUpdate) < this.CACHE_DURATION) {
      return this.poolCache.get(cacheKey)!;
    }

    try {
      const [poolPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), tokenMint.toBytes()],
        PROGRAM_ID
      );

      const poolAccount = await program.account.liquidityPool.fetch(poolPDA);
      
      const poolData: PoolData = {
        tokenReserve: poolAccount.tokenReserve,
        solReserve: poolAccount.solReserve,
        lpSupply: poolAccount.lpSupply,
        feeRate: poolAccount.feeRate,
        tokenMint: poolAccount.tokenMint,
        isInitialized: true // Pool exists, so it's initialized
      };
      
      // Cache the result
      this.poolCache.set(cacheKey, poolData);
      this.lastCacheUpdate = now;
      
      return poolData;
    } catch (error) {
      console.warn(`Pool not found for token ${tokenMint.toString()}:`, error);
      return null;
    }
  }

  async getRecentTransactions(wallet?: any): Promise<ExchangeTransaction[]> {
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
      console.error('Error fetching recent transactions:', error);
      return this.getFallbackTransactions();
    }
  }

  async getExchangeStats(wallet?: any): Promise<ExchangeStats> {
    try {
      const exchangeTokens = await this.getExchangeTokens(wallet);
      
      const totalValue = exchangeTokens.reduce((sum, token) => sum + token.totalValue, 0);
      
      // Calculate daily volume from recent transactions
      const recentTransactions = await this.getRecentTransactions(wallet);
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const dailyVolume = recentTransactions
        .filter(tx => tx.timestamp > oneDayAgo)
        .reduce((sum, tx) => sum + tx.solAmount, 0);
      
      return {
        totalValue,
        totalUsers: 0, // TODO: Calculate from unique wallet addresses
        dailyVolume,
        totalTransactions: recentTransactions.length
      };
    } catch (error) {
      console.error('Error calculating exchange stats:', error);
      return {
        totalValue: 0,
        totalUsers: 0,
        dailyVolume: 0,
        totalTransactions: 0
      };
    }
  }

  // Check if a token has an existing liquidity pool
  async hasLiquidityPool(tokenMint: string, wallet?: any): Promise<boolean> {
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
  async getTokensWithPools(tokens: any[], wallet?: any): Promise<any[]> {
    const tokensWithPools = [];
    
    for (const token of tokens) {
      // Always include SOL as it's the base trading pair
      if (token.mint === 'SOL' || token.symbol === 'SOL') {
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

  async getUserTokenBalances(publicKey: PublicKey, wallet?: any): Promise<ExchangeToken[]> {
    try {
      const userTokens: ExchangeToken[] = [];
      
      // Get SOL balance and add it to the tokens array
      const solBalance = await this.connection.getBalance(publicKey);
      const solBalanceInSol = solBalance / LAMPORTS_PER_SOL;
      
      // Add SOL to the user tokens array
      userTokens.push({
        mint: 'SOL',
        symbol: 'SOL',
        name: 'Solana',
        balance: solBalanceInSol,
        totalValue: solBalanceInSol, // SOL price is 1 SOL = 1 SOL
        price: 1,
        change24h: 0, // TODO: Get real SOL price change
        decimals: 9
      });
      
      // Get ALL SPL token accounts owned by the user
      const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID
      });
      
      // Get popular tokens for metadata lookup
      const popularTokens = await tokenRegistry.getPopularTokens();
      const tokenMetadataMap = new Map();
      popularTokens.forEach(token => {
        tokenMetadataMap.set(token.mint, token);
      });
      
      // Initialize program if wallet is provided (for pool data)
      let program: Program<FlexibleTokenExchange> | null = null;
      if (wallet) {
        try {
          program = this.initializeProgram(wallet);
        } catch (error) {
          console.warn('Could not initialize program for pool data:', error);
        }
      }
      
      // Process each token account
      for (const tokenAccountInfo of tokenAccounts.value) {
        try {
          const tokenAccount = await this.connection.getTokenAccountBalance(tokenAccountInfo.pubkey);
          
          if (tokenAccount.value.uiAmount && tokenAccount.value.uiAmount > 0) {
            // Parse the token account data to get the mint
            const accountData = tokenAccountInfo.account.data;
            const mintBytes = accountData.slice(0, 32);
            const mintAddress = new PublicKey(mintBytes).toString();
            
            // Check if we have metadata for this token
            const tokenMetadata = tokenMetadataMap.get(mintAddress);
            
            let symbol, name, decimals;
            if (tokenMetadata) {
              symbol = tokenMetadata.symbol;
              name = tokenMetadata.name;
              decimals = tokenMetadata.decimals;
            } else {
              // For tokens without metadata, use mint address
              const shortMint = `${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)}`;
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
                  const tokenReserveNumber = poolData.tokenReserve.toNumber() / Math.pow(10, decimals);
                  const solReserveNumber = poolData.solReserve.toNumber() / LAMPORTS_PER_SOL;
                  price = tokenReserveNumber > 0 ? solReserveNumber / tokenReserveNumber : 0;
                }
              } catch (poolError) {
                // Pool doesn't exist or other error - price remains 0
                console.debug(`No pool data for token ${mintAddress}:`, poolError);
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
              decimals
            });
          }
        } catch (error) {
          console.warn('Error processing token account:', error);
          // Continue with next token account
        }
      }
      
      return userTokens;
    } catch (error) {
      console.error('Error fetching user token balances:', error);
      return [];
    }
  }

  private getFallbackExchangeTokens(): ExchangeToken[] {
    return [
      {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        balance: 0,
        totalValue: 0,
        price: 0.000025,
        change24h: 0.1,
        decimals: 6
      }
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
    wallet: any,
    publicKey: PublicKey
  ): Promise<{ success: boolean; signature?: string; error?: string; tokensReceived?: number; actualTokensReceived?: number; expectedTokensReceived?: number }> {
    try {
      // Validate wallet connection
      if (!wallet || !publicKey) {
        throw new Error('Wallet not connected or missing publicKey');
      }

      const program = this.initializeProgram(wallet);
      const tokenMintPubkey = new PublicKey(tokenMint);
      const userPublicKey = publicKey;

      // Convert SOL amount to lamports
      const solAmountLamports = new BN(solAmount * LAMPORTS_PER_SOL);
      const minTokenAmountBN = new BN(minTokenAmount * Math.pow(10, 6)); // Assuming 6 decimals

      // Calculate all required PDAs
      const [poolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      const [tokenVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('token_vault'), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('sol_vault'), tokenMintPubkey.toBuffer()],
        PROGRAM_ID
      );

      // Calculate user's associated token account using SPL token helper
      const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      
      const userTokenAccountPda = await getAssociatedTokenAddress(
        tokenMintPubkey,
        userPublicKey
      );

      // Check if user's token account exists, create if it doesn't
      let needsTokenAccountCreation = false;
      try {
        const accountInfo = await this.connection.getAccountInfo(userTokenAccountPda);
        if (!accountInfo) {
          console.log('User token account does not exist, will create it...');
          needsTokenAccountCreation = true;
        } else {
          console.log('User token account already exists');
        }
      } catch (error) {
        console.warn('Could not check token account existence:', error);
        needsTokenAccountCreation = true; // Assume we need to create it
      }

      // Create token account if needed
      if (needsTokenAccountCreation) {
        try {
          console.log('Creating associated token account...');
          const createAccountIx = createAssociatedTokenAccountInstruction(
            userPublicKey, // payer
            userTokenAccountPda, // associated token account
            userPublicKey, // owner
            tokenMintPubkey // mint
          );

          const createAccountTx = new Transaction().add(createAccountIx);
          const walletAdapter = this.createWalletAdapter(wallet);
          
          // Use the wallet adapter's sendTransaction method with fallback
          let createAccountSig: string;
          if (typeof walletAdapter.sendTransaction === 'function') {
            createAccountSig = await walletAdapter.sendTransaction(createAccountTx, this.connection);
          } else if (typeof walletAdapter.signTransaction === 'function') {
            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
            createAccountTx.feePayer = userPublicKey;
            createAccountTx.recentBlockhash = blockhash;
            const signedTx = await walletAdapter.signTransaction(createAccountTx);
            createAccountSig = await this.connection.sendRawTransaction(signedTx.serialize());
          } else {
            throw new Error('Wallet adapter does not support sending transactions');
          }
          await this.connection.confirmTransaction(createAccountSig, 'confirmed');
          console.log('Token account created successfully:', createAccountSig);
        } catch (createError) {
          console.error('Failed to create token account:', createError);
          // Continue anyway - the swap instruction might handle creation
        }
      }

      const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

      // Execute the swap
      console.log('Executing swap with accounts:', {
        pool: poolPda.toString(),
        user: userPublicKey.toString(),
        userTokenAccount: userTokenAccountPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        solVault: solVaultPda.toString(),
        tokenProgram: TOKEN_PROGRAM_ID.toString(),
        systemProgram: SYSTEM_PROGRAM_ID.toString()
      });

      let signature: string;
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

        // Use wallet adapter's sendTransaction method with fallback
        const walletAdapter = this.createWalletAdapter(wallet);
        if (typeof walletAdapter.sendTransaction === 'function') {
          signature = await walletAdapter.sendTransaction(transaction, this.connection);
        } else if (typeof walletAdapter.signTransaction === 'function') {
          const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
          transaction.feePayer = userPublicKey;
          transaction.recentBlockhash = blockhash;
          const signedTx = await walletAdapter.signTransaction(transaction);
          signature = await this.connection.sendRawTransaction(signedTx.serialize());
        } else {
          throw new Error('Wallet adapter does not support sending transactions');
        }

        console.log('Swap transaction signature:', signature);
      } catch (swapError: any) {
        console.error('Swap transaction failed:', swapError);
        
        // Provide more detailed error information
        if (swapError.message) {
          console.error('Error message:', swapError.message);
        }
        if (swapError.logs) {
          console.error('Transaction logs:', swapError.logs);
        }
        
        throw new Error(`Swap transaction failed: ${swapError.message || 'Unknown error'}`);
      }

      // Wait for confirmation
      let confirmation;
      try {
        confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
        console.log('Transaction confirmed:', confirmation);
        
        if (confirmation.value.err) {
          console.error('Transaction failed on-chain:', confirmation.value.err);
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
        }
      } catch (confirmError: any) {
        console.error('Transaction confirmation failed:', confirmError);
        throw new Error(`Transaction confirmation failed: ${confirmError.message || 'Unknown error'}`);
      }

      // Verify the swap by checking the actual token balance
      let actualTokensReceived = 0;
      try {
        console.log('Verifying token balance after swap...');
        const tokenAccountInfo = await this.connection.getTokenAccountBalance(userTokenAccountPda);
        actualTokensReceived = parseInt(tokenAccountInfo.value.amount);
        console.log('Actual tokens received:', actualTokensReceived);
        
        if (actualTokensReceived === 0) {
          console.warn('Warning: Token balance is still 0 after swap. Transaction may have failed.');
        }
      } catch (balanceError: any) {
        console.error('Failed to verify token balance:', balanceError);
        // Fall back to calculation if we can't read the balance
      }

      // Calculate expected tokens received (for comparison)
      let expectedTokensReceived = 0;
      try {
        const poolData = await this.getPoolData(program, tokenMintPubkey);
        if (poolData) {
          const solReserve = poolData.solReserve.toNumber() / LAMPORTS_PER_SOL;
          const tokenReserve = poolData.tokenReserve.toNumber() / Math.pow(10, 6);
          
          // Simple AMM calculation: tokens_out = (sol_in * token_reserve) / (sol_reserve + sol_in)
          // Apply 0.3% fee
          const solInAfterFee = solAmount * 0.997;
          expectedTokensReceived = (solInAfterFee * tokenReserve) / (solReserve + solInAfterFee);
          console.log('Expected tokens from calculation:', expectedTokensReceived);
        }
      } catch (poolError: any) {
        console.error('Failed to calculate expected tokens:', poolError);
      }

      const tokensReceived = actualTokensReceived > 0 ? actualTokensReceived : expectedTokensReceived;

      return {
        success: true,
        signature,
        tokensReceived,
        actualTokensReceived,
        expectedTokensReceived
      };
    } catch (error) {
      console.error('Error executing swap:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  clearCache(): void {
    this.poolCache.clear();
    this.tokenCache.clear();
    this.lastCacheUpdate = 0;
  }
}

export default BlockchainDataService;