import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSearchParams } from 'react-router-dom';
import { PublicKey, LAMPORTS_PER_SOL, Transaction, VersionedTransaction, TransactionMessage, Connection, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Loader2, Plus, Coins, BarChart3, Zap, ArrowRight } from 'lucide-react';
import idl from '../idl/flexible_token_exchange.json';
import type { FlexibleTokenExchange } from '../types/flexible_token_exchange';
import { tokenRegistry } from '../utils/tokenRegistry';
import type { TokenInfo } from '../utils/tokenRegistry';

const PROGRAM_ID = new PublicKey('HWHCbmSEp3V56MM7oVGYmdVLaFupSUUr9kpbfj2zAAuq');

interface PoolData {
  tokenReserve: BN;
  solReserve: BN;
  lpSupply: BN;
  feeRate: number;
  tokenMint: PublicKey;
  isInitialized: boolean;
}

interface LiquidityForm {
  selectedTokenMint: string;
  tokenAmount: string;
  solAmount: string;
  operation: 'add' | 'remove';
}

const LiquidityPool: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signTransaction, connected } = useWallet();
  const [searchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [poolData, setPoolData] = useState<PoolData | null>(null);
 const [form, setForm] = useState<LiquidityForm>({
    selectedTokenMint: '',
    tokenAmount: '',
    solAmount: '',
    operation: 'add'
  });
  const [validationErrors, setValidationErrors] = useState<{
    tokenAmount?: string;
    solAmount?: string;
    token?: string;
  }>({});
  const [customTokenMint, setCustomTokenMint] = useState('');
  const [customTokenName, setCustomTokenName] = useState('');
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);
  const [loadingCustomToken, setLoadingCustomToken] = useState(false);
  const [showQuickAction, setShowQuickAction] = useState(false);
  const [popularTokens, setPopularTokens] = useState<TokenInfo[]>([]);
  const [loadingPopularTokens, setLoadingPopularTokens] = useState(false);
  const [showCustomEntry, setShowCustomEntry] = useState(false);

  // Target token for quick action
  const TARGET_TOKEN_MINT = 'FXyW3yBRGPFLivyedoNeG1Me4fudMst7JhC6FjqFNYAp';
  const TARGET_TOKEN_AMOUNT = '1000';

  // Load popular tokens on component mount
  useEffect(() => {
    const loadPopularTokens = async () => {
      setLoadingPopularTokens(true);
      try {
        const tokens = await tokenRegistry.getPopularTokens();
        setPopularTokens(tokens);
      } catch (error) {
        console.error('Failed to load popular tokens:', error);
        // Fallback to default tokens if search fails
        const fallbackTokens = tokenRegistry.getFallbackTokens();
        setPopularTokens(fallbackTokens);
      } finally {
        setLoadingPopularTokens(false);
      }
    };

    loadPopularTokens();
  }, []);

  const provider = useMemo(() => {
    if (!publicKey || !signTransaction) return null;
    const wallet = {
      publicKey,
      signTransaction,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => {
        return Promise.all(transactions.map((tx: T) => signTransaction(tx)));
      },
    };
    return new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
  }, [connection, publicKey, signTransaction]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(idl as Idl, provider) as Program<FlexibleTokenExchange>;
  }, [provider]);

  const getPoolPDA = useCallback((tokenMint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), tokenMint.toBytes()],
      PROGRAM_ID
    );
  }, []);

  const getTokenVaultPDA = useCallback((tokenMint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('token_vault'), tokenMint.toBytes()],
      PROGRAM_ID
    );
  }, []);

  const getSolVaultPDA = useCallback((tokenMint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('sol_vault'), tokenMint.toBytes()],
      PROGRAM_ID
    );
  }, []);

  const getLpMintPDA = useCallback((tokenMint: PublicKey) => {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('lp_mint'), tokenMint.toBytes()],
      PROGRAM_ID
    );
  }, []);

  // Removed createUsdcMint function as it's no longer needed for flexible token system

  // Helper function to simulate both legacy Transaction and VersionedTransaction
  const simulateAnyTransaction = useCallback(async (
    connection: Connection,
    tx: Transaction | VersionedTransaction,
    feePayer: PublicKey
  ) => {
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');

    if ('message' in tx) {
      // Handle VersionedTransaction
      const message = TransactionMessage.decompile(tx.message, {
        addressLookupTableAccounts: [],
      });

      const legacyTx = new Transaction();
      legacyTx.recentBlockhash = latestBlockhash.blockhash;
      legacyTx.feePayer = feePayer;
      legacyTx.add(...message.instructions);

      return connection.simulateTransaction(legacyTx);
    } else {
      // Already a legacy Transaction
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = feePayer;
      return connection.simulateTransaction(tx);
    }
  }, []);

  const fetchPoolData = useCallback(async () => {
    if (!program || !selectedToken) return;

    try {
      const tokenMint = new PublicKey(selectedToken.mint);
      const [poolPda] = getPoolPDA(tokenMint);

      const poolAccount = await program.account.liquidityPool.fetch(poolPda);
      
      setPoolData({
        tokenReserve: poolAccount.tokenReserve,
        solReserve: poolAccount.solReserve,
        lpSupply: poolAccount.lpSupply,
        feeRate: poolAccount.feeRate / 100,
        tokenMint: tokenMint,
        isInitialized: true, // If we can fetch the account, it's initialized
      });
    } catch (error) {
      console.error('Error fetching pool data:', error);
      const errorObj = error as Error;
      
      // Check if it's because the pool doesn't exist yet
      if (errorObj.message.includes('Account does not exist') || errorObj.message.includes('Invalid account')) {
        // This is expected for new tokens - don't show an error
        setPoolData(null);
      } else {
        // Show error for other issues
        setStatus(`⚠️ Unable to fetch pool data: ${errorObj.message}`);
        setPoolData(null);
      }
    }
  }, [program, selectedToken, getPoolPDA]);

  const initializePool = useCallback(async () => {
    console.log('initializePool function called');
    console.log('Wallet state:', { connected, publicKey: publicKey?.toString() });
    console.log('Form state:', { selectedToken, tokenAmount: form.tokenAmount, solAmount: form.solAmount });
    
    if (!connected || !publicKey || !program || !selectedToken) {
      console.log('Wallet not connected or missing requirements');
      setStatus('Please connect wallet and select a token first!');
      return;
    }

    if (!form.tokenAmount || !form.solAmount) {
      console.log('Missing amounts:', { tokenAmount: form.tokenAmount, solAmount: form.solAmount });
      setStatus('Please enter both token and SOL amounts!');
      return;
    }
    
    setLoading(true);
    setStatus('Initializing liquidity pool...');
    
    try {
      console.log('Selected Token Debug:', {
        selectedToken,
        mint: selectedToken.mint,
        symbol: selectedToken.symbol,
        name: selectedToken.name,
        decimals: selectedToken.decimals
      });
      
      const tokenMint = new PublicKey(selectedToken.mint);
      
      // Verify the token mint account exists and has mint authority
      try {
        const mintInfo = await connection.getAccountInfo(tokenMint);
        if (!mintInfo) {
          throw new Error(`Token mint account ${tokenMint.toString()} does not exist`);
        }
        
        // Parse mint data to check mint authority
        if (mintInfo.data.length < 82) {
          throw new Error(`Invalid mint account data length: ${mintInfo.data.length}`);
        }
        
        // Check if mint authority exists (bytes 4-36, if all zeros then no authority)
        const mintAuthorityBytes = mintInfo.data.slice(4, 36);
        const hasMintAuthority = !mintAuthorityBytes.every(byte => byte === 0);
        
        if (!hasMintAuthority) {
          throw new Error(`Token mint ${selectedToken.symbol} does not have a mint authority. Only tokens with mint authority can be used for liquidity pools.`);
        }
        
        console.log('Token mint account verified:', {
          address: tokenMint.toString(),
          owner: mintInfo.owner.toString(),
          executable: mintInfo.executable,
          lamports: mintInfo.lamports,
          dataLength: mintInfo.data.length,
          hasMintAuthority: hasMintAuthority
        });
      } catch (mintError: unknown) {
        throw new Error(`Failed to verify token mint: ${mintError instanceof Error ? mintError.message : String(mintError)}`);
      }
      
      const [poolPda, poolBump] = getPoolPDA(tokenMint);
      const [tokenVault, tokenVaultBump] = getTokenVaultPDA(tokenMint);
      const [solVault, solVaultBump] = getSolVaultPDA(tokenMint);
      const [lpMint, lpMintBump] = getLpMintPDA(tokenMint);
      
      // Check if pool already exists
      try {
        const existingPool = await connection.getAccountInfo(poolPda);
        if (existingPool) {
          throw new Error(`Pool for token ${selectedToken.symbol} already exists at ${poolPda.toString()}`);
        }
        console.log('Pool account does not exist yet - good for initialization');
      } catch (poolError: unknown) {
        if (poolError instanceof Error && poolError.message.includes('already exists')) {
          throw poolError;
        }
        // If it's not an "already exists" error, it's expected that the account doesn't exist yet
        console.log('Pool account does not exist yet - good for initialization');
      }
      
      // Check if user has sufficient SOL balance
      const balance = await connection.getBalance(publicKey);
      const requiredSol = parseFloat(form.solAmount) * LAMPORTS_PER_SOL;
      const estimatedFees = 0.01 * LAMPORTS_PER_SOL; // Estimate transaction fees
      
      if (balance < requiredSol + estimatedFees) {
        throw new Error(`Insufficient SOL balance. Required: ${(requiredSol + estimatedFees) / LAMPORTS_PER_SOL} SOL, Available: ${balance / LAMPORTS_PER_SOL} SOL`);
      }
      
      const userTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        publicKey
      );

      // Check if user token account exists and has sufficient balance
      try {
        const tokenAccountInfo = await connection.getTokenAccountBalance(userTokenAccount);
        const requiredTokens = parseFloat(form.tokenAmount) * Math.pow(10, selectedToken.decimals);
        const availableTokens = parseFloat(tokenAccountInfo.value.amount);
        
        if (availableTokens < requiredTokens) {
          throw new Error(`Insufficient token balance. Required: ${form.tokenAmount} ${selectedToken.symbol}, Available: ${availableTokens / Math.pow(10, selectedToken.decimals)} ${selectedToken.symbol}`);
        }
      } catch (tokenError: unknown) {
        if (tokenError instanceof Error && tokenError.message.includes('could not find account')) {
          throw new Error(`Token account not found. Please ensure you have ${selectedToken.symbol} tokens in your wallet.`);
        }
        throw tokenError;
      }

      // LP account will be created automatically by the program
      
      const tokenAmountBN = new BN(parseFloat(form.tokenAmount) * Math.pow(10, selectedToken.decimals));
      const solAmountBN = new BN(parseFloat(form.solAmount) * LAMPORTS_PER_SOL);
      
      console.log('Building transaction with amounts:', {
        tokenAmount: tokenAmountBN.toString(),
        solAmount: solAmountBN.toString(),
        feeRate: 30,
        tokenMint: tokenMint.toString(),
        poolPda: poolPda.toString()
      });
      
      // Validate all required accounts exist and are properly calculated
      const [poolAuthority, poolAuthorityBump] = PublicKey.findProgramAddressSync([Buffer.from('pool_authority'), tokenMint.toBytes()], PROGRAM_ID);
      
      // Verify all PDAs are valid PublicKey instances
      const accountsToVerify = {
        pool: poolPda,
        poolAuthority,
        tokenVault,
        solVault,
        lpMint,
        userTokenAccount
      };
      
      for (const [name, account] of Object.entries(accountsToVerify)) {
        if (!account || !(account instanceof PublicKey)) {
          throw new Error(`Invalid ${name} account: ${account}`);
        }
      }
      
      console.log('Transaction accounts (verified):', {
        pool: poolPda.toString(),
        authority: publicKey.toString(),
        token_mint: tokenMint.toString(),
        pool_authority: poolAuthority.toString(),
        token_vault: tokenVault.toString(),
        sol_vault: solVault.toString(),
        lp_mint: lpMint.toString(),
        authority_token_account: userTokenAccount.toString()
      });
      
      // Debug the actual PDA addresses being calculated
      console.log('Calculated PDA Addresses:', {
        poolPda: poolPda.toString(),
        poolAuthority: poolAuthority.toString(),
        tokenVault: tokenVault.toString(),
        solVault: solVault.toString(),
        lpMint: lpMint.toString()
      });
      
      // Verify these match what we expect by recalculating
      const expectedPoolPda = PublicKey.findProgramAddressSync([Buffer.from('pool'), tokenMint.toBytes()], PROGRAM_ID)[0];
      const expectedPoolAuthority = PublicKey.findProgramAddressSync([Buffer.from('pool_authority'), tokenMint.toBytes()], PROGRAM_ID)[0];
      const expectedTokenVault = PublicKey.findProgramAddressSync([Buffer.from('token_vault'), tokenMint.toBytes()], PROGRAM_ID)[0];
      const expectedSolVault = PublicKey.findProgramAddressSync([Buffer.from('sol_vault'), tokenMint.toBytes()], PROGRAM_ID)[0];
      const expectedLpMint = PublicKey.findProgramAddressSync([Buffer.from('lp_mint'), tokenMint.toBytes()], PROGRAM_ID)[0];
      
      console.log('Expected PDA Addresses:', {
        poolPda: expectedPoolPda.toString(),
        poolAuthority: expectedPoolAuthority.toString(),
        tokenVault: expectedTokenVault.toString(),
        solVault: expectedSolVault.toString(),
        lpMint: expectedLpMint.toString()
      });
      
      // Check if they match
      console.log('PDA Address Matches:', {
        poolPda: poolPda.equals(expectedPoolPda),
        poolAuthority: poolAuthority.equals(expectedPoolAuthority),
        tokenVault: tokenVault.equals(expectedTokenVault),
        solVault: solVault.equals(expectedSolVault),
        lpMint: lpMint.equals(expectedLpMint)
      });
      
      console.log('PDA bumps:', {
        poolBump,
        poolAuthorityBump,
        tokenVaultBump,
        solVaultBump,
        lpMintBump
      });
      
      // Debug PDA derivation to see what's causing the seeds constraint violation
      console.log('PDA Derivation Debug:', {
        programId: PROGRAM_ID.toString(),
        tokenMint: tokenMint.toString(),
        tokenMintBuffer: Array.from(tokenMint.toBytes()),
        poolSeeds: [Buffer.from('pool'), tokenMint.toBytes()],
        poolAuthoritySeeds: [Buffer.from('pool_authority'), tokenMint.toBytes()],
        tokenVaultSeeds: [Buffer.from('token_vault'), tokenMint.toBytes()],
        solVaultSeeds: [Buffer.from('sol_vault'), tokenMint.toBytes()],
        lpMintSeeds: [Buffer.from('lp_mint'), tokenMint.toBytes()]
      });
      
      // Add fee rate parameter (30 basis points = 0.3%)
      const feeRate = 30;
      
      // Declare transaction variable in higher scope
      let transaction: Transaction;
      
      // Calculate authority token account
      const authorityTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        publicKey
      );
      
      // Try with explicit accounts first (most reliable)
      try {
        console.log('Attempting to initialize pool with explicit accounts...');
        const signature = await program.methods
          .initializePool(tokenAmountBN, solAmountBN, feeRate)
          .accountsPartial({
            tokenMint: tokenMint,
            pool: poolPda,
            authority: publicKey,
            poolAuthority: poolAuthority,
            tokenVault: tokenVault,
            solVault: solVault,
            lpMint: lpMint,
            authorityTokenAccount: authorityTokenAccount,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        
        console.log('Pool initialized successfully with signature:', signature);
        setStatus('Pool initialized successfully!');
        setLoading(false);
        
        // Refresh pool data
        await fetchPoolData();
        return;
      } catch (explicitError: unknown) {
        console.log('Explicit accounts method failed:', explicitError instanceof Error ? explicitError.message : String(explicitError));
      }
      
      // If RPC fails, fall back to transaction method with manual account resolution
      try {
      transaction = await program.methods
        .initializePool(tokenAmountBN, solAmountBN, feeRate)
        .accountsPartial({
          tokenMint: tokenMint,
          pool: poolPda,
          authority: publicKey,
          poolAuthority: poolAuthority,
          tokenVault: tokenVault,
          solVault: solVault,
          lpMint: lpMint,
          authorityTokenAccount: authorityTokenAccount,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .transaction();
      
      // Continue with the existing transaction flow...
      console.log('Transaction method succeeded, continuing with manual signing...');
 
       // Validate transaction before sending
      if (!transaction) {
        throw new Error('Failed to build transaction');
      }
      
      if (!transaction.instructions || transaction.instructions.length === 0) {
        throw new Error('Transaction has no instructions');
      }
      
      console.log('Transaction built successfully:', {
        instructionCount: transaction.instructions.length,
        signers: transaction.signatures?.length || 0
      });

      // Get fresh blockhash and set transaction properties
      let latestBlockhash = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = publicKey;
      
      // Validate transaction size
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
      console.log('Transaction size:', serializedTransaction.length, 'bytes');
      
      if (serializedTransaction.length > 1232) { // Solana transaction size limit
        throw new Error('Transaction too large. Please reduce the number of operations.');
      }
      
      // Simulate transaction first to catch errors early
      console.log('Simulating transaction...');
      setStatus('Validating transaction...');
      
      try {
        // Use the helper function to handle both legacy Transaction and VersionedTransaction
        const simulationResult = await simulateAnyTransaction(connection, transaction, publicKey);
        
        if (simulationResult.value.err) {
          console.error('Transaction simulation failed:', simulationResult.value.err);
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
        }
        
        console.log('Transaction simulation successful:', {
          computeUnitsConsumed: simulationResult.value.unitsConsumed,
          logs: simulationResult.value.logs?.slice(-5) // Last 5 logs
        });
      } catch (simError: unknown) {
        console.error('Simulation error:', simError);
        
        // Provide more specific error messages for simulation failures
        let simErrorMessage = simError instanceof Error ? simError.message : String(simError);
        if (simError instanceof Error && simError.message?.includes('Invalid arguments')) {
          simErrorMessage = 'Transaction validation failed due to invalid parameters. Please check your inputs.';
        } else if (simError instanceof Error && simError.message?.includes('insufficient funds')) {
          simErrorMessage = 'Insufficient funds for this transaction. Please check your SOL and token balances.';
        } else if (simError instanceof Error && simError.message?.includes('Account not found')) {
          simErrorMessage = 'Required account not found. Please ensure the token account exists.';
        }
        
        throw new Error(`Transaction validation failed: ${simErrorMessage}`);
      }
      
      console.log('Sending transaction to wallet for signing...');
      setStatus('Please approve the transaction in your wallet...');
      
      // Send transaction with improved error handling and retries
      console.log('Sending transaction...');
      let signature: string;
      let retryCount = 0;
      const maxRetries = 3;
      
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
          
          signature = await sendTransaction(transaction, connection, sendOptions);
          console.log('Transaction sent successfully, signature:', signature);
          break;
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
                const signedTransaction = await signTransaction!(transaction);
                const rawTransaction = signedTransaction.serialize();
                signature = await connection.sendRawTransaction(rawTransaction, {
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
          latestBlockhash = await connection.getLatestBlockhash('confirmed');
          transaction.recentBlockhash = latestBlockhash.blockhash;
        }
      }
      
      setStatus('⏳ Confirming transaction...');
      
      // Wait for confirmation with timeout
      const confirmationPromise = connection.confirmTransaction({
        signature: signature!,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }, 'confirmed');
      
      // Add timeout to confirmation
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
      );
      
      const confirmation = await Promise.race([confirmationPromise, timeoutPromise]) as { value?: { err?: unknown } };
      
      if (confirmation.value?.err) {
        throw new Error(`Transaction failed on blockchain: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log('Transaction confirmed successfully:', confirmation);
      setStatus(`Pool initialized successfully! Transaction: ${signature!}`);
      await fetchPoolData();
      
    } catch (transactionError: unknown) {
      console.error('Transaction method failed:', transactionError);
      throw transactionError;
    }
      
  } catch (error: unknown) {
      console.error('Error initializing pool:', error);
      const errorObj = error as Error & { name?: string; code?: number; cause?: unknown };
      let errorMessage = errorObj.message || 'Unknown error occurred';
      
      // Handle specific wallet errors
      if (errorObj.name === 'WalletSendTransactionError' || errorMessage.includes('WalletSendTransactionError')) {
        console.error('Wallet transaction error details:', errorObj);
        
        if (errorMessage.includes('User rejected') || errorMessage.includes('rejected')) {
          errorMessage = '❌ Transaction was rejected by user. Please try again and approve the transaction in your wallet.';
        } else if (errorMessage.includes('Unexpected error')) {
          errorMessage = '❌ Wallet transaction failed. This could be due to insufficient funds, network issues, or wallet connectivity problems. Please check your wallet and try again.';
        } else {
          errorMessage = `❌ Wallet error: ${errorMessage}. Please check your wallet connection and try again.`;
        }
      }
      // Handle balance and token errors (from our pre-checks)
      else if (errorMessage.includes('Insufficient SOL balance')) {
        errorMessage = `❌ ${errorMessage}`;
      } else if (errorMessage.includes('Insufficient token balance')) {
        errorMessage = `❌ ${errorMessage}`;
      } else if (errorMessage.includes('Token account not found')) {
        errorMessage = `❌ ${errorMessage}`;
      }
      // Handle program/blockchain errors
      else if (errorMessage.includes('insufficient funds')) {
        errorMessage = '❌ Insufficient funds. Please ensure you have enough SOL for transaction fees and the required token amount.';
      } else if (errorMessage.includes('Pool already exists')) {
        errorMessage = '❌ A pool for this token already exists. You can add liquidity to the existing pool instead.';
      } else if (errorMessage.includes('Invalid token') || errorMessage.includes('Invalid account')) {
        errorMessage = '❌ Invalid token. Please verify the token mint address is correct.';
      } else if (errorMessage.includes('Network') || errorMessage.includes('timeout') || errorMessage.includes('connection')) {
        errorMessage = '❌ Network error. Please check your internet connection and try again.';
      } else if (errorMessage.includes('Transaction failed')) {
        errorMessage = `❌ Transaction failed on blockchain: ${errorMessage}`;
      } else if (errorMessage.includes('Simulation failed')) {
        errorMessage = '❌ Transaction simulation failed. This usually indicates insufficient funds or invalid parameters.';
      }
      // Generic error handling
      else {
        errorMessage = `❌ Error initializing pool: ${errorMessage}`;
      }
      
      setStatus(errorMessage);
      
      // Additional logging for debugging
      console.log('Error details:', {
        name: errorObj.name,
        message: errorObj.message,
        stack: errorObj.stack,
        cause: errorObj.cause
      });
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, selectedToken, form.tokenAmount, form.solAmount, program, getPoolPDA, getTokenVaultPDA, getSolVaultPDA, getLpMintPDA, connection, simulateAnyTransaction, sendTransaction, signTransaction, fetchPoolData]);

  useEffect(() => {
    if (selectedToken) {
      fetchPoolData();
    }
  }, [selectedToken, fetchPoolData]);

  // Handle URL parameters for pre-filling
  useEffect(() => {
    const tokenMint = searchParams.get('token');
    const amount = searchParams.get('amount');
    
    if (tokenMint && !selectedToken) {
      // Pre-fill with URL parameters
      setCustomTokenMint(tokenMint);
      if (amount) {
        setForm(prev => ({ ...prev, tokenAmount: amount }));
      }
      
      // Auto-select if it's the target token
      if (tokenMint === TARGET_TOKEN_MINT) {
        setShowQuickAction(true);
        setCustomTokenName('Target Token');
      }
    }
  }, [searchParams, selectedToken, TARGET_TOKEN_MINT]);

  // Validation functions
  const validateTokenAmount = useCallback((amount: string): string | undefined => {
    if (!amount || amount.trim() === '') {
      return 'Token amount is required';
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return 'Token amount must be a positive number';
    }
    if (numAmount < 0.000001) {
      return 'Token amount must be at least 0.000001';
    }
    return undefined;
  }, []);

  const validateSolAmount = useCallback((amount: string): string | undefined => {
    if (!amount || amount.trim() === '') {
      return 'SOL amount is required';
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return 'SOL amount must be a positive number';
    }
    if (numAmount < 0.001) {
      return 'SOL amount must be at least 0.001';
    }
    return undefined;
  }, []);

  const validateForm = useCallback(() => {
    console.log('validateForm called with:', { selectedToken, tokenAmount: form.tokenAmount, solAmount: form.solAmount });
    const errors: { tokenAmount?: string; solAmount?: string; token?: string } = {};
    
    if (!selectedToken) {
      errors.token = 'Please select a token';
      console.log('Validation error: No token selected');
    }
    
    const tokenError = validateTokenAmount(form.tokenAmount);
    const solError = validateSolAmount(form.solAmount);
    
    if (tokenError) {
      errors.tokenAmount = tokenError;
      console.log('Validation error: Invalid token amount:', form.tokenAmount);
    }
    if (solError) {
      errors.solAmount = solError;
      console.log('Validation error: Invalid SOL amount:', form.solAmount);
    }
    
    setValidationErrors(errors);
    const isValid = Object.keys(errors).length === 0 && selectedToken !== null;
    console.log('Form validation result:', isValid, 'Errors:', errors, 'Selected token:', selectedToken?.symbol);
    return isValid;
  }, [form.tokenAmount, form.solAmount, validateTokenAmount, validateSolAmount, selectedToken]);

  // Quick action handler for target token
  const handleQuickAction = useCallback(async () => {
    setCustomTokenMint(TARGET_TOKEN_MINT);
    setCustomTokenName('Target Token');
    setForm(prev => ({ 
      ...prev, 
      tokenAmount: TARGET_TOKEN_AMOUNT,
      solAmount: '1.0' // Default SOL amount
    }));
    
    // Auto-submit the token
    try {
      const tokenMetadata: TokenInfo = {
        mint: TARGET_TOKEN_MINT,
        name: 'Target Token',
        symbol: 'TARGET',
        decimals: 9,
        logoUri: undefined
      };
      
      setSelectedToken(tokenMetadata);
      
      // Clear any existing validation errors
      setValidationErrors({});
      setStatus(`✅ Target token loaded successfully! Ready to create liquidity pool.`);
    } catch (error) {
      console.error('Error loading target token:', error);
      setStatus(`❌ Failed to load target token`);
    }
  }, [TARGET_TOKEN_MINT, TARGET_TOKEN_AMOUNT]);



  const handleCustomTokenSubmit = useCallback(async () => {
    if (!customTokenName.trim() || !customTokenMint.trim()) {
      setStatus('❌ Please enter both token name and mint address');
      return;
    }

    setLoadingCustomToken(true);
    try {
      // Validate mint address format with detailed error message
      const validationError = tokenRegistry.getValidationError(customTokenMint);
      if (validationError) {
        setStatus(`❌ ${validationError}`);
        setLoadingCustomToken(false);
        return;
      }

      // Try to fetch token metadata, but if it fails, create a custom token info
      let tokenMetadata: TokenInfo;
      try {
        const fetchedMetadata = await tokenRegistry.getTokenMetadata(connection, customTokenMint);
        if (fetchedMetadata) {
          tokenMetadata = {
            ...fetchedMetadata,
            name: customTokenName // Use custom name if provided
          };
        } else {
          // Create custom token info if metadata not found
          tokenMetadata = {
            mint: customTokenMint,
            name: customTokenName,
            symbol: customTokenName.toUpperCase().slice(0, 6), // Use first 6 chars as symbol
            decimals: 9, // Default to 9 decimals for SPL tokens
            logoUri: undefined
          };
        }
      } catch {
        // If fetching fails, create custom token info
        tokenMetadata = {
          mint: customTokenMint,
          name: customTokenName,
          symbol: customTokenName.toUpperCase().slice(0, 6),
          decimals: 9,
          logoUri: undefined
        };
      }
      
      // Check if token is already selected
      if (selectedToken && selectedToken.mint === tokenMetadata.mint) {
        setStatus('ℹ️ This token is already selected.');
        setCustomTokenMint('');
        setCustomTokenName('');
        setLoadingCustomToken(false);
        return;
      }
      
      setSelectedToken(tokenMetadata);
      setForm(prev => ({ ...prev, selectedTokenMint: tokenMetadata.mint }));
      setCustomTokenMint('');
      setCustomTokenName('');
      setStatus(`✅ Token "${tokenMetadata.name}" (${tokenMetadata.symbol}) added successfully`);
    } catch (error) {
      console.error('Error adding custom token:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`❌ Failed to add token: ${errorMessage}. Please verify the information and try again.`);
    } finally {
      setLoadingCustomToken(false);
    }
  }, [customTokenMint, customTokenName, selectedToken, connection]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>
      
      <div className="relative z-10 max-w-5xl mx-auto p-6">
        {/* Header Section */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600/80 to-blue-600/80 px-8 py-12">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-6 lg:space-y-0">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-sm rounded-2xl border border-white/30 shadow-lg flex items-center justify-center">
                  <Coins className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent mb-2">Liquidity Pools</h1>
                  <p className="text-xl text-blue-100/90">Create and manage token-SOL liquidity pools</p>
                </div>
              </div>
              <div className="flex flex-col items-start lg:items-end space-y-4">
                <div className="bg-gradient-to-r from-white/20 to-white/10 backdrop-blur-sm rounded-2xl border border-white/30 shadow-lg p-1">
                  <WalletMultiButton className="!bg-gradient-to-r !from-purple-500 !to-blue-500 hover:!from-purple-600 hover:!to-blue-600 !text-white !font-semibold !px-8 !py-4 !rounded-xl !transition-all !duration-300 !shadow-lg !border-0" />
                </div>
                {connected && publicKey && (
                  <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm border border-green-400/30 rounded-xl px-4 py-2 shadow-lg">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg"></div>
                      <span className="font-medium text-white text-sm">
                        {publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-6)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {!connected ? (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-12">
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-gradient-to-br from-purple-500/20 to-blue-500/20 backdrop-blur-sm rounded-3xl border border-white/30 shadow-lg flex items-center justify-center mx-auto mb-8">
                <Coins className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-3xl font-bold bg-gradient-to-r from-white to-purple-100 bg-clip-text text-transparent mb-4">Connect Your Wallet</h3>
              <p className="text-lg text-white/80 mb-8 max-w-md mx-auto leading-relaxed">
                Connect your Solana wallet to create and manage liquidity pools
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 max-w-2xl mx-auto">
                <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg">
                  <div className="w-4 h-4 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full mx-auto mb-3"></div>
                  <span className="text-sm font-medium text-white">Create Pools</span>
                </div>
                <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg">
                  <div className="w-4 h-4 bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full mx-auto mb-3"></div>
                  <span className="text-sm font-medium text-white">Manage Liquidity</span>
                </div>
                <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg">
                  <div className="w-4 h-4 bg-gradient-to-r from-purple-400 to-purple-600 rounded-full mx-auto mb-3"></div>
                  <span className="text-sm font-medium text-white">Track Positions</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Quick Action Section */}
            {showQuickAction && (
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8">
                <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                  <div className="flex items-start space-x-6 mb-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-indigo-500/20 backdrop-blur-sm rounded-2xl border border-white/30 shadow-lg flex items-center justify-center">
                      <Zap className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">Quick Setup - Create SOL Trading Pair</h3>
                      <p className="text-lg text-white/80">Set up {TARGET_TOKEN_AMOUNT} tokens to trade with SOL</p>
                      <p className="text-sm text-blue-300 mt-2">💡 Others will be able to buy your token using SOL</p>
                    </div>
                  </div>
                  
                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                      <div className="flex items-center space-x-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-purple-500/30 to-indigo-600/30 backdrop-blur-sm rounded-2xl border border-white/20 flex items-center justify-center shadow-lg">
                          <span className="text-white font-bold text-xl">T</span>
                        </div>
                        <div>
                          <p className="font-semibold text-white text-lg">Target Token</p>
                          <p className="text-white/70 font-mono text-sm">{TARGET_TOKEN_MINT.slice(0, 8)}...{TARGET_TOKEN_MINT.slice(-8)}</p>
                          <p className="text-purple-300 font-medium text-sm">{TARGET_TOKEN_AMOUNT.toLocaleString()} tokens → SOL trading pair</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-center">
                          <p className="text-sm text-white/60">Amount</p>
                          <p className="font-bold text-lg text-white">{TARGET_TOKEN_AMOUNT.toLocaleString()}</p>
                        </div>
                        <ArrowRight className="w-6 h-6 text-purple-300" />
                        <div className="text-center">
                          <p className="text-sm text-white/60">Trading Pair</p>
                          <p className="font-bold text-lg text-purple-300">TOKEN/SOL</p>
                        </div>
                      </div>
                      
                      <div className="bg-gradient-to-r from-white/20 to-white/10 backdrop-blur-sm rounded-2xl border border-white/30 shadow-lg p-1">
                        <button
                          onClick={handleQuickAction}
                          className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-semibold px-8 py-4 rounded-xl transition-all duration-300 shadow-lg"
                        >
                          <span className="flex items-center justify-center">
                            <Zap className="w-5 h-5 mr-2" />
                            Quick Setup
                          </span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-6 backdrop-blur-sm bg-blue-500/10 border border-blue-400/20 rounded-2xl p-4">
                      <div className="flex items-start space-x-3">
                        <div className="w-6 h-6 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full flex items-center justify-center mt-0.5">
                          <span className="text-white text-xs font-bold">i</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-blue-200">Creating a SOL Trading Pair</p>
                          <p className="text-sm text-blue-300 mt-1">
                            This will create a liquidity pool where others can buy your token using SOL. 
                            You'll need to provide both your tokens and SOL as initial liquidity.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Token Selection */}
              <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500/30 to-indigo-600/30 backdrop-blur-sm rounded-xl border border-white/20 flex items-center justify-center shadow-md">
                    <Plus className="w-5 h-5 text-blue-300" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Select Token</h3>
                    <p className="text-white/70">Choose from popular tokens or enter custom token details</p>
                  </div>
                </div>
                
                {selectedToken ? (
                  <div className="backdrop-blur-sm bg-green-500/10 border border-green-400/20 rounded-2xl p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {selectedToken.logoUri ? (
                          <img src={selectedToken.logoUri} alt={selectedToken.symbol} className="w-14 h-14 rounded-2xl shadow-lg border border-white/20" />
                        ) : (
                          <div className="w-14 h-14 bg-gradient-to-br from-blue-500/30 to-indigo-600/30 backdrop-blur-sm rounded-2xl border border-white/20 flex items-center justify-center shadow-lg">
                            <span className="text-white font-bold text-xl">{selectedToken.symbol[0]}</span>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-green-200 text-lg">{selectedToken.name}</p>
                          <p className="text-green-300 font-medium">{selectedToken.symbol} • {selectedToken.mint.slice(0, 8)}...{selectedToken.mint.slice(-8)}</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-r from-white/20 to-white/10 backdrop-blur-sm rounded-xl border border-white/30 shadow-lg p-1">
                        <button
                          onClick={() => {
                            setSelectedToken(null);
                            setCustomTokenName('');
                            setCustomTokenMint('');
                            setShowCustomEntry(false);
                            setForm(prev => ({ ...prev, selectedTokenMint: '' }));
                          }}
                          className="bg-gradient-to-r from-red-500/80 to-red-600/80 hover:from-red-600 hover:to-red-700 text-white font-medium px-4 py-2 rounded-lg transition-all duration-300"
                        >
                          <span className="text-sm font-medium">Clear</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Popular Tokens Dropdown */}
                    <div className="space-y-3">
                      <label className="text-lg font-semibold text-white">
                        Popular Tokens
                      </label>
                      {loadingPopularTokens ? (
                        <div className="flex items-center justify-center p-4 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl">
                          <Loader2 className="animate-spin w-5 h-5 text-blue-400 mr-2" />
                          <span className="text-white/70">Loading tokens...</span>
                        </div>
                      ) : (
                        <select
                          value={selectedToken ? (selectedToken as TokenInfo).mint : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              const token = popularTokens.find(t => t.mint === e.target.value);
                              if (token) {
                                setSelectedToken(token);
                                setForm(prev => ({ ...prev, selectedTokenMint: token.mint }));
                              }
                            }
                          }}
                          className="w-full p-4 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-300 shadow-lg"
                        >
                          <option value="" className="bg-gray-800 text-white">Select a popular token...</option>
                          {popularTokens.map((token) => (
                            <option key={token.mint} value={token.mint} className="bg-gray-800 text-white">
                              {token.name} ({token.symbol}) - {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="flex items-center space-x-4">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                      <span className="text-sm text-white/70 font-medium backdrop-blur-sm bg-white/10 px-3 py-1 rounded-full border border-white/20">OR</span>
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                    </div>

                    {/* Custom Token Entry Toggle */}
                    <button
                      onClick={() => setShowCustomEntry(!showCustomEntry)}
                      className="w-full p-4 backdrop-blur-sm bg-white/5 border-2 border-dashed border-white/30 rounded-xl hover:border-blue-400/50 hover:bg-white/10 transition-all duration-300 shadow-lg"
                    >
                      <div className="flex items-center justify-center space-x-2">
                        <Plus className="w-5 h-5 text-blue-300" />
                        <span className="text-white font-medium">
                          {showCustomEntry ? 'Hide Custom Token Entry' : 'Add Custom Token'}
                        </span>
                      </div>
                    </button>

                    {/* Custom Token Entry Form */}
                    {showCustomEntry && (
                      <div className="space-y-6 p-6 backdrop-blur-sm bg-white/5 rounded-xl border border-white/20 shadow-lg">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <label className="text-lg font-semibold text-white">
                              Token Name
                            </label>
                            <input
                              type="text"
                              value={customTokenName}
                              onChange={(e) => setCustomTokenName(e.target.value)}
                              placeholder="Enter token name (e.g., My Custom Token)"
                              className="w-full p-4 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-300 shadow-lg"
                            />
                          </div>
                          
                          <div className="space-y-3">
                            <label className="text-lg font-semibold text-white">
                              Token Mint Address
                            </label>
                            <input
                              type="text"
                              value={customTokenMint}
                              onChange={(e) => setCustomTokenMint(e.target.value)}
                              placeholder="Enter mint address (e.g., So11111...)"
                              className="w-full p-4 backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-300 shadow-lg"
                            />
                          </div>
                        </div>
                        
                        <button
                          onClick={handleCustomTokenSubmit}
                          disabled={loadingCustomToken || !customTokenName.trim() || !customTokenMint.trim()}
                          className="w-full py-4 bg-gradient-to-r from-blue-500/80 to-indigo-600/80 hover:from-blue-600 hover:to-indigo-700 disabled:from-gray-500/50 disabled:to-gray-600/50 text-white font-semibold rounded-xl transition-all duration-300 shadow-lg backdrop-blur-sm border border-white/20"
                        >
                          {loadingCustomToken ? (
                            <span className="flex items-center justify-center">
                              <Loader2 className="animate-spin w-5 h-5 mr-3" />
                              Adding Token...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center">
                              <Plus className="w-5 h-5 mr-2" />
                              Add Custom Token
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Pool Configuration */}
              {selectedToken && (
                  <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/30 to-emerald-600/30 backdrop-blur-sm rounded-xl border border-white/20 flex items-center justify-center shadow-md">
                        <Plus className="w-6 h-6 text-green-300" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-white">Initialize Liquidity Pool</h3>
                        <p className="text-white/70">Set initial liquidity amounts for {selectedToken.symbol}/SOL pair</p>
                        <div className="backdrop-blur-sm bg-blue-500/10 border border-blue-400/20 rounded-xl p-4 mt-4">
                          <div className="flex items-start space-x-3">
                            <div className="bg-gradient-to-br from-blue-500/30 to-blue-600/30 backdrop-blur-sm rounded-full p-2 mt-0.5 border border-white/20">
                              <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-blue-200">Creating a SOL Trading Pair</h4>
                              <p className="text-sm text-blue-300 mt-1">
                                You're creating a liquidity pool where others can trade SOL for your token. 
                                Your tokens will be available for purchase using SOL on the exchange.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-white/80">
                          {selectedToken.symbol} Amount
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={form.tokenAmount}
                            onChange={(e) => {
                              setForm(prev => ({ ...prev, tokenAmount: e.target.value }));
                              // Clear validation error when user starts typing
                              if (validationErrors.tokenAmount) {
                                setValidationErrors(prev => ({ ...prev, tokenAmount: undefined }));
                              }
                            }}
                            onBlur={() => {
                              const error = validateTokenAmount(form.tokenAmount);
                              if (error) {
                                setValidationErrors(prev => ({ ...prev, tokenAmount: error }));
                              }
                            }}
                            placeholder={`Enter ${selectedToken.symbol} amount`}
                            className={`w-full px-4 py-3 pr-24 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-200 ${validationErrors.tokenAmount ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/50' : ''}`}
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                            {selectedToken.logoUri ? (
                              <img src={selectedToken.logoUri} alt={selectedToken.symbol} className="w-6 h-6 rounded-full border border-white/20" />
                            ) : (
                              <div className="w-6 h-6 bg-gradient-to-br from-blue-500/30 to-blue-600/30 backdrop-blur-sm rounded-full border border-white/20 flex items-center justify-center">
                                <span className="text-blue-300 font-bold text-xs">{selectedToken.symbol[0]}</span>
                              </div>
                            )}
                            <span className="text-white/60 text-sm">{selectedToken.symbol}</span>
                          </div>
                          {validationErrors.tokenAmount && (
                            <p className="text-red-400 text-sm mt-1">{validationErrors.tokenAmount}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-white/80">
                          SOL Amount
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={form.solAmount}
                            onChange={(e) => {
                              setForm(prev => ({ ...prev, solAmount: e.target.value }));
                              // Clear validation error when user starts typing
                              if (validationErrors.solAmount) {
                                setValidationErrors(prev => ({ ...prev, solAmount: undefined }));
                              }
                            }}
                            onBlur={() => {
                              const error = validateSolAmount(form.solAmount);
                              if (error) {
                                setValidationErrors(prev => ({ ...prev, solAmount: error }));
                              }
                            }}
                            placeholder="Enter SOL amount"
                            className={`w-full px-4 py-3 pr-20 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50 focus:border-purple-400/50 transition-all duration-200 ${validationErrors.solAmount ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/50' : ''}`}
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                            <div className="w-6 h-6 bg-gradient-to-br from-purple-500/30 to-purple-600/30 backdrop-blur-sm rounded-full border border-white/20 flex items-center justify-center">
                              <span className="text-purple-300 font-bold text-xs">◎</span>
                            </div>
                            <span className="text-white/60 text-sm">SOL</span>
                          </div>
                          {validationErrors.solAmount && (
                            <p className="text-red-400 text-sm mt-1">{validationErrors.solAmount}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        console.log('=== Initialize Pool Button Clicked ===');
                        console.log('Current state values:');
                        console.log('  - loading:', loading);
                        console.log('  - selectedToken:', selectedToken);
                        console.log('  - form.tokenAmount:', form.tokenAmount);
                        console.log('  - form.solAmount:', form.solAmount);
                        console.log('  - validationErrors:', validationErrors);
                        console.log('  - connected:', connected);
                        console.log('  - publicKey:', publicKey?.toString());
                        console.log('  - program:', !!program);
                        
                        const buttonDisabled = loading || !selectedToken || !form.tokenAmount || !form.solAmount || Object.keys(validationErrors).length > 0;
                        console.log('Button disabled calculation:', buttonDisabled);
                        console.log('  - loading:', loading);
                        console.log('  - !selectedToken:', !selectedToken);
                        console.log('  - !form.tokenAmount:', !form.tokenAmount);
                        console.log('  - !form.solAmount:', !form.solAmount);
                        console.log('  - validationErrors count:', Object.keys(validationErrors).length);
                        
                        const isFormValid = validateForm();
                        console.log('Form validation result:', isFormValid);
                        
                        if (isFormValid) {
                          console.log('✅ Form is valid, calling initializePool...');
                          initializePool();
                        } else {
                          console.log('❌ Form validation failed, not calling initializePool');
                          console.log('Validation errors after validateForm:', validationErrors);
                        }
                        console.log('=== End Button Click Debug ===');
                      }}
                      disabled={loading || !selectedToken || !form.tokenAmount || !form.solAmount || Object.keys(validationErrors).length > 0}
                      className="w-full mt-8 px-6 py-4 bg-gradient-to-r from-green-500/20 to-emerald-600/20 backdrop-blur-sm border border-green-400/30 rounded-xl text-white font-semibold hover:from-green-500/30 hover:to-emerald-600/30 hover:border-green-400/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-green-500/20"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin mr-3" />
                          Initializing Pool...
                        </span>
                      ) : poolData ? (
                        <span className="flex items-center justify-center">
                          <span className="mr-2">✅</span>
                          Pool Successfully Initialized
                        </span>
                      ) : (
                        <span className="flex items-center justify-center">
                          <span className="mr-2">🚀</span>
                          Initialize Liquidity Pool
                        </span>
                      )}
                    </button>
                  </div>
                )}

                {poolData && (
                  <div className="backdrop-blur-sm bg-gradient-to-br from-green-500/10 to-emerald-600/10 border border-green-400/20 rounded-2xl p-8 shadow-xl">
                    <div className="flex items-start space-x-4 mb-8">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500/30 to-emerald-600/30 backdrop-blur-sm rounded-xl border border-green-400/30 flex items-center justify-center shadow-lg">
                        <BarChart3 className="w-6 h-6 text-green-300" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white mb-2">Pool Successfully Created</h3>
                        <p className="text-white/70">Your liquidity pool is now active and ready for trading</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6 shadow-lg">
                        <div className="flex items-center space-x-2 mb-3">
                          {selectedToken?.logoUri ? (
                            <img src={selectedToken.logoUri} alt={selectedToken.symbol} className="w-5 h-5 rounded-full border border-white/20" />
                          ) : (
                            <div className="w-5 h-5 bg-gradient-to-br from-blue-500/30 to-indigo-600/30 backdrop-blur-sm rounded-full border border-white/20 flex items-center justify-center">
                              <span className="text-blue-300 font-bold text-xs">{selectedToken?.symbol?.[0]}</span>
                            </div>
                          )}
                          <p className="text-sm font-medium text-white/80">{selectedToken?.symbol} Reserve</p>
                        </div>
                        <p className="text-2xl font-bold text-white">{poolData.tokenReserve.toString()}</p>
                        <p className="text-white/60 text-sm">{selectedToken?.symbol} tokens</p>
                      </div>
                      
                      <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6 shadow-lg">
                        <div className="flex items-center space-x-2 mb-3">
                          <div className="w-5 h-5 bg-gradient-to-br from-purple-500/30 to-pink-500/30 backdrop-blur-sm rounded-full border border-white/20 flex items-center justify-center">
                            <span className="text-purple-300 font-bold text-xs">◎</span>
                          </div>
                          <p className="text-sm font-medium text-white/80">SOL Reserve</p>
                        </div>
                        <p className="text-2xl font-bold text-white">{(poolData.solReserve.toNumber() / LAMPORTS_PER_SOL).toFixed(4)}</p>
                        <p className="text-white/60 text-sm">SOL tokens</p>
                      </div>
                      
                      <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6 shadow-lg">
                        <div className="flex items-center space-x-2 mb-3">
                          <div className="w-5 h-5 bg-gradient-to-br from-green-500/30 to-emerald-500/30 backdrop-blur-sm rounded-full border border-white/20 flex items-center justify-center">
                            <span className="text-green-300 font-bold text-xs">LP</span>
                          </div>
                          <p className="text-sm font-medium text-white/80">LP Token Supply</p>
                        </div>
                        <p className="text-2xl font-bold text-white">{poolData.lpSupply.toString()}</p>
                        <p className="text-white/60 text-sm">LP tokens</p>
                      </div>
                      
                      <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6 shadow-lg">
                        <div className="flex items-center space-x-2 mb-3">
                          <div className="w-5 h-5 bg-gradient-to-br from-orange-500/30 to-red-500/30 backdrop-blur-sm rounded-full border border-white/20 flex items-center justify-center">
                            <span className="text-orange-300 font-bold text-xs">%</span>
                          </div>
                          <p className="text-sm font-medium text-white/80">Fee Rate</p>
                        </div>
                        <p className="text-2xl font-bold text-white">{poolData.feeRate}%</p>
                        <p className="text-white/60 text-sm">Trading fee</p>
                      </div>
                    </div>
                    
                    <div className="backdrop-blur-sm bg-blue-500/10 border border-blue-400/20 rounded-xl p-6 mt-6 shadow-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                        <p className="text-sm font-medium text-blue-300">Pool Status: Active</p>
                      </div>
                      <p className="text-white/70 text-sm">Your liquidity pool is now live and available for other users to trade against. You can manage your position or add more liquidity at any time.</p>
                    </div>
                  </div>
                )}

              {status && (
                <div className={`backdrop-blur-sm border rounded-xl p-4 mt-6 shadow-lg ${
                  status.includes('Error') 
                    ? 'bg-red-500/10 border-red-400/20 text-red-300' 
                    : 'bg-green-500/10 border-green-400/20 text-green-300'
                }`}>
                  <p className="font-medium">{status}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  );
};

export default LiquidityPool;