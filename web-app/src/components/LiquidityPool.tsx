import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSearchParams } from 'react-router-dom';
import { PublicKey, LAMPORTS_PER_SOL, Transaction, VersionedTransaction, TransactionMessage, Connection, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import type { Idl } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Loader2, Plus, Coins, BarChart3, Zap, ArrowRight, Minus } from 'lucide-react';
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
  
  const [removeLiquidityForm, setRemoveLiquidityForm] = useState({
    lpTokens: '',
    minTokenAmount: '',
    minSolAmount: ''
  });
  
  const [userLpBalance, setUserLpBalance] = useState<number>(0);
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

  const fetchUserLpBalance = useCallback(async () => {
    console.log('🔍 [DEBUG] fetchUserLpBalance called');
    console.log('🔍 [DEBUG] Initial checks:', {
      program: !!program,
      selectedToken: selectedToken ? {
        symbol: selectedToken.symbol,
        mint: selectedToken.mint,
        decimals: selectedToken.decimals
      } : null,
      publicKey: publicKey?.toString()
    });
    
    if (!program || !selectedToken || !publicKey) {
      console.log('🔍 [DEBUG] Missing required data, returning early');
      return;
    }

    try {
      const tokenMint = new PublicKey(selectedToken.mint);
      console.log('🔍 [DEBUG] Token mint:', tokenMint.toString());
      
      const [lpMint] = getLpMintPDA(tokenMint);
      console.log('🔍 [DEBUG] LP mint PDA calculated:', lpMint.toString());
      
      // Get user's LP token account
      const userLpTokenAccount = await getAssociatedTokenAddress(
        lpMint,
        publicKey
      );
      console.log('🔍 [DEBUG] User LP token account address:', userLpTokenAccount.toString());
      
      const accountInfo = await connection.getAccountInfo(userLpTokenAccount);
      console.log('🔍 [DEBUG] Account info exists:', !!accountInfo);
      
      if (accountInfo) {
        console.log('🔍 [DEBUG] Account info details:', {
          lamports: accountInfo.lamports,
          owner: accountInfo.owner.toString(),
          executable: accountInfo.executable,
          rentEpoch: accountInfo.rentEpoch
        });
        
        const tokenAccount = await connection.getTokenAccountBalance(userLpTokenAccount);
        console.log('🔍 [DEBUG] Token account balance details:', {
          amount: tokenAccount.value.amount,
          decimals: tokenAccount.value.decimals,
          uiAmount: tokenAccount.value.uiAmount,
          uiAmountString: tokenAccount.value.uiAmountString
        });
        
        const balance = tokenAccount.value.uiAmount || 0;
        console.log('🔍 [DEBUG] Setting userLpBalance to:', balance);
        setUserLpBalance(balance);
      } else {
        console.log('🔍 [DEBUG] No account info found, setting userLpBalance to 0');
        setUserLpBalance(0);
      }
    } catch (error) {
      console.error('🔍 [DEBUG] Error fetching user LP balance:', error);
      console.error('🔍 [DEBUG] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      setUserLpBalance(0);
    }
  }, [program, selectedToken, publicKey, connection, getLpMintPDA]);

  const addLiquidity = useCallback(async () => {
    if (!program || !publicKey || !selectedToken || !poolData) {
      setStatus('❌ Missing required data for adding liquidity');
      return;
    }

    setLoading(true);
    setStatus('🔄 Adding liquidity to existing pool...');

    try {
      // Validation
      if (!form.tokenAmount || !form.solAmount) {
        throw new Error('Please enter both token and SOL amounts');
      }

      if (parseFloat(form.tokenAmount) <= 0 || parseFloat(form.solAmount) <= 0) {
        throw new Error('Amounts must be greater than 0');
      }

      const tokenMint = new PublicKey(selectedToken.mint);
      
      // Validate SOL vault owner before proceeding
      console.log('Validating SOL vault owner before adding liquidity...');
      setStatus('Validating SOL vault security...');
      const vaultValidation = await validateSolVaultOwner(tokenMint);
      if (!vaultValidation.isValid) {
        throw new Error(vaultValidation.error || 'SOL vault owner validation failed');
      }
      
      // Get all required PDAs
      const [poolPda] = getPoolPDA(tokenMint);
      const [tokenVault] = getTokenVaultPDA(tokenMint);
      const [solVault] = getSolVaultPDA(tokenMint);
      
      // Check user balances
      const balance = await connection.getBalance(publicKey);
      const requiredSol = parseFloat(form.solAmount) * LAMPORTS_PER_SOL;
      const estimatedFees = 0.01 * LAMPORTS_PER_SOL;
      
      if (balance < requiredSol + estimatedFees) {
        throw new Error(`Insufficient SOL balance. Required: ${(requiredSol + estimatedFees) / LAMPORTS_PER_SOL} SOL, Available: ${balance / LAMPORTS_PER_SOL} SOL`);
      }
      
      const userTokenAccount = await getAssociatedTokenAddress(tokenMint, publicKey);
      
      // Check token balance
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
      
      const tokenAmountBN = new BN(parseFloat(form.tokenAmount) * Math.pow(10, selectedToken.decimals));
      const solAmountBN = new BN(parseFloat(form.solAmount) * LAMPORTS_PER_SOL);
      const minLpTokensBN = new BN(0); // Accept any amount of LP tokens
      
      console.log('Adding liquidity with amounts:', {
        tokenAmount: tokenAmountBN.toString(),
        solAmount: solAmountBN.toString(),
        minLpTokens: minLpTokensBN.toString(),
        poolPda: poolPda.toString()
      });
      
      // Try RPC method first
      try {
        console.log('Attempting to add liquidity with RPC method...');
        const signature = await program.methods
          .addLiquidity(tokenAmountBN, solAmountBN, minLpTokensBN)
          .accountsPartial({
            pool: poolPda,
            user: publicKey,
            userTokenAccount: userTokenAccount,
            tokenVault: tokenVault,
            solVault: solVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        console.log('Liquidity added successfully with signature:', signature);
        setStatus('✅ Liquidity added successfully!');
        setLoading(false);
        
        // Refresh pool data and user LP balance
        await fetchPoolData();
        await fetchUserLpBalance();
        
        // Clear form
        setForm(prev => ({ ...prev, tokenAmount: '', solAmount: '' }));
        return;
      } catch (rpcError: unknown) {
        console.log('RPC method failed, trying transaction method:', rpcError instanceof Error ? rpcError.message : String(rpcError));
      }
      
      // Fall back to transaction method
      const transaction = await program.methods
        .addLiquidity(tokenAmountBN, solAmountBN, minLpTokensBN)
        .accountsPartial({
          pool: poolPda,
          user: publicKey,
          userTokenAccount: userTokenAccount,
          tokenVault: tokenVault,
          solVault: solVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      
      if (!transaction) {
        throw new Error('Failed to build transaction');
      }
      
      // Get fresh blockhash and set transaction properties
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = publicKey;
      
      // Simulate transaction
      console.log('Simulating add liquidity transaction...');
      setStatus('Validating transaction...');
      
      try {
        const simulationResult = await simulateAnyTransaction(connection, transaction, publicKey);
        
        if (simulationResult.value.err) {
          console.error('Transaction simulation failed:', simulationResult.value.err);
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
        }
        
        console.log('Transaction simulation successful');
      } catch (simError: unknown) {
        console.error('Simulation error:', simError);
        throw new Error(`Transaction validation failed: ${simError instanceof Error ? simError.message : String(simError)}`);
      }
      
      console.log('Sending transaction to wallet for signing...');
      setStatus('Please approve the transaction in your wallet...');
      
      // Send transaction
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      });
      
      console.log('Add liquidity transaction sent, signature:', signature);
      setStatus('⏳ Confirming transaction...');
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log('Add liquidity transaction confirmed');
      setStatus('✅ Liquidity added successfully!');
      
      // Refresh pool data and user LP balance
      await fetchPoolData();
      await fetchUserLpBalance();
      
      // Clear form
      setForm(prev => ({ ...prev, tokenAmount: '', solAmount: '' }));
      
    } catch (error: unknown) {
      console.error('Add liquidity error:', error);
      const errorObj = error as Error;
      setStatus(`❌ Failed to add liquidity: ${errorObj.message}`);
    } finally {
      setLoading(false);
    }
  }, [program, publicKey, selectedToken, poolData, form.tokenAmount, form.solAmount, connection, getPoolPDA, getTokenVaultPDA, getSolVaultPDA, simulateAnyTransaction, sendTransaction, fetchPoolData, fetchUserLpBalance]);

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
          // If pool exists, validate SOL vault owner before proceeding
          console.log('Pool exists, validating SOL vault owner...');
          setStatus('Validating SOL vault security...');
          const vaultValidation = await validateSolVaultOwner(tokenMint);
          if (!vaultValidation.isValid) {
            throw new Error(vaultValidation.error || 'SOL vault owner validation failed');
          }
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

  // Fetch user LP balance when token is selected and wallet is connected
  useEffect(() => {
    if (selectedToken && connected && publicKey) {
      fetchUserLpBalance();
    }
  }, [selectedToken, connected, publicKey, fetchUserLpBalance]);

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

  const validateSolVaultOwner = useCallback(async (tokenMint: PublicKey): Promise<{ isValid: boolean; error?: string }> => {
    try {
      const [solVault] = getSolVaultPDA(tokenMint);
      
      // Get the SOL vault account info
      const solVaultAccountInfo = await connection.getAccountInfo(solVault);
      
      if (!solVaultAccountInfo) {
        return {
          isValid: false,
          error: 'SOL vault account does not exist'
        };
      }
      
      // Check if the owner is the system program
      const isSystemOwned = solVaultAccountInfo.owner.equals(SystemProgram.programId);
      
      if (!isSystemOwned) {
        return {
          isValid: false,
          error: `SOL vault owner must be the system program for security. Current owner: ${solVaultAccountInfo.owner.toString()}`
        };
      }
      
      return { isValid: true };
    } catch (error) {
      console.error('Error validating SOL vault owner:', error);
      return {
        isValid: false,
        error: `Failed to validate SOL vault owner: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }, [connection, getSolVaultPDA]);

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
            name: customTokenName, // Use custom name if provided
            decimals: 6 // Force use 6 decimals for consistency
          };
        } else {
          // Create custom token info if metadata not found
          tokenMetadata = {
            mint: customTokenMint,
            name: customTokenName,
            symbol: customTokenName.toUpperCase().slice(0, 6), // Use first 6 chars as symbol
            decimals: 6, // Default to 6 decimals for SPL tokens
            logoUri: undefined
          };
        }
      } catch {
        // If fetching fails, create custom token info
        tokenMetadata = {
          mint: customTokenMint,
          name: customTokenName,
          symbol: customTokenName.toUpperCase().slice(0, 6),
          decimals: 6,
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
      
      // Fetch existing pool data when custom token is selected
      await fetchPoolData();
    } catch (error) {
      console.error('Error adding custom token:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`❌ Failed to add token: ${errorMessage}. Please verify the information and try again.`);
    } finally {
      setLoadingCustomToken(false);
    }
  }, [customTokenMint, customTokenName, selectedToken, connection]);

  const removeLiquidity = useCallback(async () => {
    console.log('=== removeLiquidity function called ===');
    console.log('Initial validation checks:');
    console.log('  - connected:', connected);
    console.log('  - publicKey:', publicKey?.toString());
    console.log('  - program:', !!program);
    console.log('  - selectedToken:', selectedToken);
    
    if (!connected || !publicKey || !program || !selectedToken) {
      console.log('❌ Validation failed: Missing wallet connection or token');
      setStatus('❌ Please connect your wallet and select a token first.');
      return;
    }

    console.log('Form validation:');
    console.log('  - lpTokens:', removeLiquidityForm.lpTokens);
    console.log('  - minTokenAmount:', removeLiquidityForm.minTokenAmount);
    console.log('  - minSolAmount:', removeLiquidityForm.minSolAmount);
    
    if (!removeLiquidityForm.lpTokens || !removeLiquidityForm.minTokenAmount || !removeLiquidityForm.minSolAmount) {
      console.log('❌ Form validation failed: Missing required fields');
      setStatus('❌ Please fill in all required fields.');
      return;
    }

    console.log('✅ All validations passed, proceeding with liquidity removal...');
    setLoading(true);
    setStatus('🔄 Removing liquidity...');

    try {
      const tokenMint = new PublicKey(selectedToken.mint);
      
      // Validate SOL vault owner before proceeding
      console.log('Validating SOL vault owner before removing liquidity...');
      setStatus('Validating SOL vault security...');
      const vaultValidation = await validateSolVaultOwner(tokenMint);
      if (!vaultValidation.isValid) {
        throw new Error(vaultValidation.error || 'SOL vault owner validation failed');
      }
      
      // Derive PDAs using the same pattern as other functions
      const [poolPda] = getPoolPDA(tokenMint);
      const [poolAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('pool_authority'), tokenMint.toBytes()],
        PROGRAM_ID
      );
      const [tokenVault] = getTokenVaultPDA(tokenMint);
      const [solVault] = getSolVaultPDA(tokenMint);
      const [lpMint] = getLpMintPDA(tokenMint);

      // Get user's token account
      const userTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(selectedToken.mint),
        publicKey
      );

      // Get user's LP token account
      const userLpTokenAccount = await getAssociatedTokenAddress(
        lpMint,
        publicKey
      );

      console.log('Remove Liquidity PDAs:', {
        poolPda: poolPda.toString(),
        poolAuthority: poolAuthority.toString(),
        tokenVault: tokenVault.toString(),
        solVault: solVault.toString(),
        lpMint: lpMint.toString(),
        userTokenAccount: userTokenAccount.toString(),
        userLpTokenAccount: userLpTokenAccount.toString()
      });

      // Convert amounts to BN
      const lpTokensAmount = new BN(parseFloat(removeLiquidityForm.lpTokens) * Math.pow(10, 9)); // Assuming 9 decimals for LP tokens
      const minTokenAmount = new BN(parseFloat(removeLiquidityForm.minTokenAmount) * Math.pow(10, selectedToken.decimals || 6));
      const minSolAmount = new BN(parseFloat(removeLiquidityForm.minSolAmount) * LAMPORTS_PER_SOL);

      console.log('Remove Liquidity Amounts:', {
        lpTokens: lpTokensAmount.toString(),
        minTokenAmount: minTokenAmount.toString(),
        minSolAmount: minSolAmount.toString()
      });

      // Call remove_liquidity function
      const tx = await program.methods
        .removeLiquidity(lpTokensAmount, minTokenAmount, minSolAmount)
        .accountsPartial({
          pool: poolPda,
          user: publicKey,
          userTokenAccount: userTokenAccount,
          tokenVault: tokenVault,
          solVault: solVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Remove liquidity transaction signature:', tx);
      setStatus(`✅ Liquidity removed successfully! Transaction: ${tx}`);
      
      // Reset form
      setRemoveLiquidityForm({
        lpTokens: '',
        minTokenAmount: '',
        minSolAmount: ''
      });
      
      // Refresh pool data and user LP balance
      await fetchPoolData();
      await fetchUserLpBalance();
      
    } catch (error) {
      console.error('Error removing liquidity:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`❌ Failed to remove liquidity: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, program, selectedToken, removeLiquidityForm, fetchPoolData, fetchUserLpBalance, setStatus, setLoading, getLpMintPDA, getPoolPDA, getSolVaultPDA, getTokenVaultPDA]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header Section */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-8">
          <div className="px-8 py-12">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-6 lg:space-y-0">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 bg-blue-500 rounded-lg shadow-sm flex items-center justify-center">
                  <Coins className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-gray-900 mb-2">Liquidity Pools</h1>
                  <p className="text-xl text-gray-600">Create and manage token-SOL liquidity pools</p>
                </div>
              </div>
              <div className="flex flex-col items-start lg:items-end space-y-4">
                <div className="bg-white border border-gray-300 rounded-lg shadow-sm p-1">
                  <WalletMultiButton className="!bg-blue-500 hover:!bg-blue-600 !text-white !font-semibold !px-8 !py-4 !rounded-lg !transition-all !duration-300 !shadow-sm !border-0" />
                </div>
                {connected && publicKey && (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                      <span className="font-medium text-gray-900 text-sm">
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
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12">
            <div className="text-center py-16">
              <div className="w-24 h-24 bg-blue-500 rounded-lg shadow-sm flex items-center justify-center mx-auto mb-8">
                <Coins className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-4">Connect Your Wallet</h3>
              <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
                Connect your Solana wallet to create and manage liquidity pools
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 max-w-2xl mx-auto">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 shadow-sm">
                  <div className="w-4 h-4 bg-blue-500 rounded-full mx-auto mb-3"></div>
                  <span className="text-sm font-medium text-gray-900">Create Pools</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 shadow-sm">
                  <div className="w-4 h-4 bg-indigo-500 rounded-full mx-auto mb-3"></div>
                  <span className="text-sm font-medium text-gray-900">Manage Liquidity</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 shadow-sm">
                  <div className="w-4 h-4 bg-purple-500 rounded-full mx-auto mb-3"></div>
                  <span className="text-sm font-medium text-gray-900">Track Positions</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Quick Action Section */}
            {showQuickAction && (
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <div className="flex items-start space-x-6 mb-6">
                    <div className="w-16 h-16 bg-blue-500 rounded-lg shadow-sm flex items-center justify-center">
                      <Zap className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Quick Setup - Create SOL Trading Pair</h3>
                      <p className="text-lg text-gray-600">Set up {TARGET_TOKEN_AMOUNT} tokens to trade with SOL</p>
                      <p className="text-sm text-blue-600 mt-2">💡 Others will be able to buy your token using SOL</p>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                      <div className="flex items-center space-x-4">
                        <div className="w-14 h-14 bg-purple-500 rounded-lg shadow-sm flex items-center justify-center">
                          <span className="text-white font-bold text-xl">T</span>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-lg">Target Token</p>
                          <p className="text-gray-600 font-mono text-sm">{TARGET_TOKEN_MINT.slice(0, 8)}...{TARGET_TOKEN_MINT.slice(-8)}</p>
                          <p className="text-purple-600 font-medium text-sm">{TARGET_TOKEN_AMOUNT.toLocaleString()} tokens → SOL trading pair</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4">
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Amount</p>
                          <p className="font-bold text-lg text-gray-900">{TARGET_TOKEN_AMOUNT.toLocaleString()}</p>
                        </div>
                        <ArrowRight className="w-6 h-6 text-purple-500" />
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Trading Pair</p>
                          <p className="font-bold text-lg text-purple-600">TOKEN/SOL</p>
                        </div>
                      </div>
                      
                      <div className="bg-white border border-gray-300 rounded-lg shadow-sm p-1">
                        <button
                          onClick={handleQuickAction}
                          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-4 rounded-lg transition-all duration-300 shadow-sm"
                        >
                          <span className="flex items-center justify-center">
                            <Zap className="w-5 h-5 mr-2" />
                            Quick Setup
                          </span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center mt-0.5">
                          <span className="text-white text-xs font-bold">i</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-blue-900">Creating a SOL Trading Pair</p>
                          <p className="text-sm text-blue-700 mt-1">
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
              <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg shadow-sm flex items-center justify-center">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Select Token</h3>
                    <p className="text-gray-600">Choose from popular tokens or enter custom token details</p>
                  </div>
                </div>
                
                {selectedToken ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        {selectedToken.logoUri ? (
                          <img src={selectedToken.logoUri} alt={selectedToken.symbol} className="w-14 h-14 rounded-lg shadow-sm border border-gray-200" />
                        ) : (
                          <div className="w-14 h-14 bg-blue-500 rounded-lg shadow-sm flex items-center justify-center">
                            <span className="text-white font-bold text-xl">{selectedToken.symbol[0]}</span>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-green-800 text-lg">{selectedToken.name}</p>
                          <p className="text-green-600 font-medium">{selectedToken.symbol} • {selectedToken.mint.slice(0, 8)}...{selectedToken.mint.slice(-8)}</p>
                        </div>
                      </div>
                      <div className="bg-white border border-gray-300 rounded-lg shadow-sm p-1">
                        <button
                          onClick={() => {
                            setSelectedToken(null);
                            setCustomTokenName('');
                            setCustomTokenMint('');
                            setShowCustomEntry(false);
                            setForm(prev => ({ ...prev, selectedTokenMint: '' }));
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white font-medium px-4 py-2 rounded-lg transition-all duration-300"
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
                      <label className="text-lg font-semibold text-gray-900">
                        Popular Tokens
                      </label>
                      {loadingPopularTokens ? (
                        <div className="flex items-center justify-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <Loader2 className="animate-spin w-5 h-5 text-blue-500 mr-2" />
                          <span className="text-blue-700">Loading tokens...</span>
                        </div>
                      ) : (
                        <select
                          value={selectedToken ? (selectedToken as TokenInfo).mint : ''}
                          onChange={async (e) => {
                            if (e.target.value) {
                              const token = popularTokens.find(t => t.mint === e.target.value);
                              if (token) {
                                setSelectedToken(token);
                                setForm(prev => ({ ...prev, selectedTokenMint: token.mint }));
                                // Fetch existing pool data when token is selected
                                await fetchPoolData();
                              }
                            } else {
                              setSelectedToken(null);
                              setForm(prev => ({ ...prev, selectedTokenMint: '' }));
                              setPoolData(null);
                            }
                          }}
                          className="w-full p-4 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 shadow-sm"
                        >
                          <option value="" className="bg-white text-gray-900">Select a popular token...</option>
                          {popularTokens.map((token) => (
                            <option key={token.mint} value={token.mint} className="bg-white text-gray-900">
                              {token.name} ({token.symbol}) - {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="flex items-center space-x-4">
                      <div className="flex-1 h-px bg-gray-300"></div>
                      <span className="text-sm text-gray-600 font-medium bg-gray-100 px-3 py-1 rounded-full border border-gray-200">OR</span>
                      <div className="flex-1 h-px bg-gray-300"></div>
                    </div>

                    {/* Custom Token Entry Toggle */}
                    <button
                      onClick={() => setShowCustomEntry(!showCustomEntry)}
                      className="w-full p-4 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all duration-300 shadow-sm"
                    >
                      <div className="flex items-center justify-center space-x-2">
                        <Plus className="w-5 h-5 text-blue-500" />
                        <span className="text-gray-700 font-medium">
                          {showCustomEntry ? 'Hide Custom Token Entry' : 'Add Custom Token'}
                        </span>
                      </div>
                    </button>

                    {/* Custom Token Entry Form */}
                    {showCustomEntry && (
                      <div className="space-y-6 p-6 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <label className="text-lg font-semibold text-gray-900">
                              Token Name
                            </label>
                            <input
                              type="text"
                              value={customTokenName}
                              onChange={(e) => setCustomTokenName(e.target.value)}
                              placeholder="Enter token name (e.g., My Custom Token)"
                              className="w-full p-4 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 shadow-sm"
                            />
                          </div>
                          
                          <div className="space-y-3">
                            <label className="text-lg font-semibold text-gray-900">
                              Token Mint Address
                            </label>
                            <input
                              type="text"
                              value={customTokenMint}
                              onChange={(e) => setCustomTokenMint(e.target.value)}
                              placeholder="Enter mint address (e.g., So11111...)"
                              className="w-full p-4 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300 shadow-sm"
                            />
                          </div>
                        </div>
                        
                        <button
                          onClick={handleCustomTokenSubmit}
                          disabled={loadingCustomToken || !customTokenName.trim() || !customTokenMint.trim()}
                          className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-all duration-300 shadow-sm border border-blue-600"
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

              {/* Existing Pool Data Display */}
              {selectedToken && poolData && (
                <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg border border-blue-200 flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-gray-900">Existing Pool Found</h3>
                      <p className="text-gray-600">Pool already exists for {selectedToken.symbol}/SOL pair</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        {selectedToken.logoUri ? (
                          <img src={selectedToken.logoUri} alt={selectedToken.symbol} className="w-5 h-5 rounded-full border border-gray-200" />
                        ) : (
                          <div className="w-5 h-5 bg-blue-100 rounded-full border border-blue-200 flex items-center justify-center">
                            <span className="text-blue-600 font-bold text-xs">{selectedToken.symbol[0]}</span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-blue-600">{selectedToken.symbol} Reserve</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">
                        {poolData.tokenReserve ? (poolData.tokenReserve.toNumber() / Math.pow(10, selectedToken.decimals || 6)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0'}
                      </p>
                    </div>
                    
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-5 h-5 bg-purple-100 rounded-full border border-purple-200 flex items-center justify-center">
                          <span className="text-purple-600 font-bold text-xs">◎</span>
                        </div>
                        <span className="text-sm font-medium text-purple-600">SOL Reserve</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">
                        {poolData.solReserve ? (poolData.solReserve.toNumber() / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0'} SOL
                      </p>
                    </div>
                    
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium text-green-600">LP Supply</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">
                        {poolData.lpSupply ? (poolData.lpSupply.toNumber() / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0'}
                      </p>
                    </div>
                    
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium text-yellow-600">Fee Rate</span>
                      </div>
                      <p className="text-xl font-bold text-gray-900">
                        {poolData.feeRate ? (poolData.feeRate / 100).toFixed(2) : '0.30'}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Pool Configuration */}
              {selectedToken && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="w-12 h-12 bg-green-100 rounded-xl border border-green-200 flex items-center justify-center shadow-md">
                        <Plus className="w-6 h-6 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-gray-900">{poolData ? 'Add Liquidity' : 'Initialize Liquidity Pool'}</h3>
                        <p className="text-gray-600">{poolData ? 'Add more liquidity to the existing' : 'Set initial liquidity amounts for'} {selectedToken.symbol}/SOL pair</p>
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-4">
                          <div className="flex items-start space-x-3">
                            <div className="bg-blue-100 rounded-full p-2 mt-0.5 border border-blue-200">
                              <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-blue-800">Creating a SOL Trading Pair</h4>
                              <p className="text-sm text-blue-700 mt-1">
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
                        <label className="text-sm font-medium text-gray-700">
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
                            className={`w-full px-4 py-3 pr-24 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${validationErrors.tokenAmount ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                            {selectedToken.logoUri ? (
                              <img src={selectedToken.logoUri} alt={selectedToken.symbol} className="w-6 h-6 rounded-full border border-gray-200" />
                            ) : (
                              <div className="w-6 h-6 bg-blue-100 rounded-full border border-blue-200 flex items-center justify-center">
                                <span className="text-blue-600 font-bold text-xs">{selectedToken.symbol[0]}</span>
                              </div>
                            )}
                            <span className="text-gray-600 text-sm">{selectedToken.symbol}</span>
                          </div>
                          {validationErrors.tokenAmount && (
                            <p className="text-red-500 text-sm mt-1">{validationErrors.tokenAmount}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-700">
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
                            className={`w-full px-4 py-3 pr-20 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${validationErrors.solAmount ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
                            <div className="w-6 h-6 bg-purple-100 rounded-full border border-purple-200 flex items-center justify-center">
                              <span className="text-purple-600 font-bold text-xs">◎</span>
                            </div>
                            <span className="text-gray-600 text-sm">SOL</span>
                          </div>
                          {validationErrors.solAmount && (
                            <p className="text-red-500 text-sm mt-1">{validationErrors.solAmount}</p>
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
                          if (poolData) {
                            console.log('✅ Form is valid, calling addLiquidity...');
                            addLiquidity();
                          } else {
                            console.log('✅ Form is valid, calling initializePool...');
                            initializePool();
                          }
                        } else {
                          console.log('❌ Form validation failed, not calling function');
                          console.log('Validation errors after validateForm:', validationErrors);
                        }
                        console.log('=== End Button Click Debug ===');
                      }}
                      disabled={loading || !selectedToken || !form.tokenAmount || !form.solAmount || Object.keys(validationErrors).length > 0}
                      className="w-full mt-8 px-6 py-4 bg-green-600 border border-green-600 rounded-xl text-white font-semibold hover:bg-green-700 hover:border-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin mr-3" />
                          {poolData ? 'Adding Liquidity...' : 'Initializing Pool...'}
                        </span>
                      ) : poolData ? (
                        <span className="flex items-center justify-center">
                          <span className="mr-2">💧</span>
                          Add Liquidity
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

                {/* Remove Liquidity Section */}
                {poolData && selectedToken && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="w-10 h-10 bg-red-100 rounded-xl border border-red-200 flex items-center justify-center shadow-md">
                        <Minus className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Remove Liquidity</h3>
                        <p className="text-gray-600">Withdraw your tokens and SOL from the pool</p>
                      </div>
                    </div>
                    
                    {/* User Liquidity Position Display */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-blue-800">Your Liquidity Position</h4>
                        <div className="flex space-x-2">
                          <button
                            onClick={fetchUserLpBalance}
                            className="px-3 py-1 bg-blue-100 border border-blue-300 rounded-lg text-blue-700 text-sm hover:bg-blue-200 transition-all duration-200"
                          >
                            Refresh
                          </button>
                          <button
                            onClick={() => {
                              console.log('🔧 [MANUAL DEBUG] Debug button clicked - triggering fetchUserLpBalance with full logging');
                              fetchUserLpBalance();
                            }}
                            className="px-3 py-1 bg-orange-100 border border-orange-300 rounded-lg text-orange-700 text-sm hover:bg-orange-200 transition-all duration-200"
                            title="Debug LP Balance - Check console for detailed logs"
                          >
                            🔧 Debug
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <p className="text-sm font-medium text-gray-600 mb-1">LP Token Balance</p>
                          <p className="text-xl font-bold text-gray-900">{userLpBalance ? userLpBalance.toFixed(4) : '0.0000'}</p>
                          <p className="text-xs text-gray-500">LP tokens</p>
                        </div>
                        
                        {poolData && userLpBalance && (
                          <>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <p className="text-sm font-medium text-gray-600 mb-1">Pool Share</p>
                              <p className="text-xl font-bold text-green-600">
                                {poolData.lpSupply.toNumber() > 0 
                                  ? ((userLpBalance * Math.pow(10, 9) / poolData.lpSupply.toNumber()) * 100).toFixed(2)
                                  : '0.00'
                                }%
                              </p>
                              <p className="text-xs text-gray-500">of total pool</p>
                            </div>
                            
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <p className="text-sm font-medium text-gray-600 mb-1">Estimated Value</p>
                              <div className="space-y-1">
                                <p className="text-sm text-gray-900">
                                  {poolData.lpSupply.toNumber() > 0 
                                    ? ((userLpBalance * Math.pow(10, 9) / poolData.lpSupply.toNumber()) * poolData.tokenReserve.toNumber() / Math.pow(10, selectedToken.decimals)).toFixed(4)
                                    : '0.0000'
                                  } {selectedToken.symbol}
                                </p>
                                <p className="text-sm text-gray-900">
                                  {poolData.lpSupply.toNumber() > 0 
                                    ? ((userLpBalance * Math.pow(10, 9) / poolData.lpSupply.toNumber()) * poolData.solReserve.toNumber() / LAMPORTS_PER_SOL).toFixed(4)
                                    : '0.0000'
                                  } SOL
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                        
                        {(!poolData || !userLpBalance) && (
                          <>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <p className="text-sm font-medium text-gray-600 mb-1">Pool Share</p>
                              <p className="text-xl font-bold text-gray-400">0.00%</p>
                              <p className="text-xs text-gray-500">of total pool</p>
                            </div>
                            
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                              <p className="text-sm font-medium text-gray-600 mb-1">Estimated Value</p>
                              <div className="space-y-1">
                                <p className="text-sm text-gray-400">0.0000 {selectedToken.symbol}</p>
                                <p className="text-sm text-gray-400">0.0000 SOL</p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {userLpBalance && userLpBalance > 0 && (
                        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-sm text-green-700 flex items-center">
                            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                            You have an active liquidity position in this pool
                          </p>
                        </div>
                      )}
                      
                      {(!userLpBalance || userLpBalance === 0) && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="text-sm text-yellow-700 flex items-center">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
                            You don't have any liquidity in this pool yet
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-700">
                          LP Tokens to Remove
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={removeLiquidityForm.lpTokens}
                            onChange={(e) => {
                              const lpAmount = e.target.value;
                              setRemoveLiquidityForm(prev => ({ ...prev, lpTokens: lpAmount }));
                              
                              // Auto-calculate minimum amounts with 1% slippage if pool data exists
                              if (poolData && lpAmount && parseFloat(lpAmount) > 0) {
                                const lpTokensToRemove = parseFloat(lpAmount) * Math.pow(10, 9); // Convert to raw amount
                                const lpSupply = poolData.lpSupply.toNumber();
                                
                                if (lpSupply > 0) {
                                  // Calculate expected token and SOL amounts
                                  const tokenShare = lpTokensToRemove / lpSupply;
                                  const expectedTokenAmount = tokenShare * poolData.tokenReserve.toNumber();
                                  const expectedSolAmount = tokenShare * poolData.solReserve.toNumber() / LAMPORTS_PER_SOL;
                                  
                                  // Apply 1% slippage (99% of expected)
                                  const minTokenAmount = (expectedTokenAmount * 0.99).toFixed(6);
                                  const minSolAmount = (expectedSolAmount * 0.99).toFixed(6);
                                  
                                  setRemoveLiquidityForm(prev => ({
                                    ...prev,
                                    minTokenAmount,
                                    minSolAmount
                                  }));
                                }
                              } else {
                                // Clear minimum amounts if no LP amount entered
                                setRemoveLiquidityForm(prev => ({
                                  ...prev,
                                  minTokenAmount: '',
                                  minSolAmount: ''
                                }));
                              }
                            }}
                            placeholder="Enter LP tokens amount"
                            className="w-full px-4 py-3 pr-16 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200"
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                            <span className="text-gray-600 text-sm">LP</span>
                          </div>
                        </div>
                        {userLpBalance && (
                          <button
                            onClick={() => {
                              const maxLpAmount = userLpBalance.toString();
                              setRemoveLiquidityForm(prev => ({ ...prev, lpTokens: maxLpAmount }));
                              
                              // Auto-calculate minimum amounts with 1% slippage for max amount
                              if (poolData && userLpBalance > 0) {
                                const lpTokensToRemove = userLpBalance * Math.pow(10, 9); // Convert to raw amount
                                const lpSupply = poolData.lpSupply.toNumber();
                                
                                if (lpSupply > 0) {
                                  // Calculate expected token and SOL amounts
                                  const tokenShare = lpTokensToRemove / lpSupply;
                                  const expectedTokenAmount = tokenShare * poolData.tokenReserve.toNumber();
                                  const expectedSolAmount = tokenShare * poolData.solReserve.toNumber() / LAMPORTS_PER_SOL;
                                  
                                  // Apply 1% slippage (99% of expected)
                                  const minTokenAmount = (expectedTokenAmount * 0.99).toFixed(6);
                                  const minSolAmount = (expectedSolAmount * 0.99).toFixed(6);
                                  
                                  setRemoveLiquidityForm(prev => ({
                                    ...prev,
                                    minTokenAmount,
                                    minSolAmount
                                  }));
                                }
                              }
                            }}
                            className="text-xs text-red-600 hover:text-red-500 transition-colors"
                          >
                            Use Max: {userLpBalance.toFixed(4)}
                          </button>
                        )}
                      </div>
                      
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-700">
                          Min {selectedToken.symbol} Amount
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={removeLiquidityForm.minTokenAmount}
                            onChange={(e) => setRemoveLiquidityForm(prev => ({ ...prev, minTokenAmount: e.target.value }))}
                            placeholder="Minimum tokens to receive"
                            className="w-full px-4 py-3 pr-20 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                            {selectedToken.logoUri ? (
                              <img src={selectedToken.logoUri} alt={selectedToken.symbol} className="w-4 h-4 rounded-full border border-gray-300" />
                            ) : (
                              <div className="w-4 h-4 bg-blue-100 border border-gray-300 rounded-full flex items-center justify-center">
                                <span className="text-blue-600 font-bold text-xs">{selectedToken.symbol[0]}</span>
                              </div>
                            )}
                            <span className="text-gray-600 text-xs">{selectedToken.symbol}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <label className="text-sm font-medium text-gray-700">
                          Min SOL Amount
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={removeLiquidityForm.minSolAmount}
                            onChange={(e) => setRemoveLiquidityForm(prev => ({ ...prev, minSolAmount: e.target.value }))}
                            placeholder="Minimum SOL to receive"
                            className="w-full px-4 py-3 pr-16 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                          />
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                            <div className="w-4 h-4 bg-purple-100 border border-gray-300 rounded-full flex items-center justify-center">
                              <span className="text-purple-600 font-bold text-xs">◎</span>
                            </div>
                            <span className="text-gray-600 text-xs">SOL</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        console.log('🔥 BUTTON CLICK DETECTED! Event:', e);
                        alert('Button clicked! Check console for details.');
                        
                        console.log('=== Remove Liquidity Button Clicked ===');
                        console.log('Current state values:');
                        console.log('  - loading:', loading);
                        console.log('  - removeLiquidityForm:', removeLiquidityForm);
                        console.log('  - userLpBalance:', userLpBalance);
                        console.log('  - selectedToken:', selectedToken);
                        console.log('  - connected:', connected);
                        console.log('  - publicKey:', publicKey?.toString());
                        console.log('  - program:', !!program);
                        
                        const buttonDisabled = loading || !removeLiquidityForm.lpTokens || !removeLiquidityForm.minTokenAmount || !removeLiquidityForm.minSolAmount || !userLpBalance || parseFloat(removeLiquidityForm.lpTokens) > userLpBalance;
                        console.log('Button disabled calculation:', buttonDisabled);
                        console.log('  - loading:', loading);
                        console.log('  - !removeLiquidityForm.lpTokens:', !removeLiquidityForm.lpTokens);
                        console.log('  - !removeLiquidityForm.minTokenAmount:', !removeLiquidityForm.minTokenAmount);
                        console.log('  - !removeLiquidityForm.minSolAmount:', !removeLiquidityForm.minSolAmount);
                        console.log('  - !userLpBalance:', !userLpBalance);
                        console.log('  - lpTokens > userLpBalance:', parseFloat(removeLiquidityForm.lpTokens) > userLpBalance);
                        
                        if (!buttonDisabled) {
                          console.log('✅ Button is enabled, calling removeLiquidity...');
                          removeLiquidity();
                        } else {
                          console.log('❌ Button is disabled, not calling removeLiquidity');
                        }
                      }}
                      disabled={loading || !removeLiquidityForm.lpTokens || !removeLiquidityForm.minTokenAmount || !removeLiquidityForm.minSolAmount || !userLpBalance || parseFloat(removeLiquidityForm.lpTokens) > userLpBalance}
                      className="w-full mt-6 px-6 py-4 bg-red-600 border border-red-600 rounded-xl text-white font-semibold hover:bg-red-700 hover:border-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-lg"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin mr-3" />
                          Removing Liquidity...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center">
                          <Minus className="w-5 h-5 mr-2" />
                          Remove Liquidity
                        </span>
                      )}
                    </button>
                    
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mt-4">
                      <div className="flex items-start space-x-2">
                        <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center mt-0.5">
                          <span className="text-yellow-900 text-xs font-bold">!</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-yellow-800">Slippage Protection</p>
                          <p className="text-sm text-yellow-700 mt-1">
                            Set minimum amounts to protect against slippage. The transaction will fail if you receive less than the specified minimums.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {poolData && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-lg">
                    <div className="flex items-start space-x-4 mb-8">
                      <div className="w-12 h-12 bg-green-100 rounded-xl border border-green-200 flex items-center justify-center shadow-sm">
                        <BarChart3 className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Pool Successfully Created</h3>
                        <p className="text-gray-600">Your liquidity pool is now active and ready for trading</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-center space-x-2 mb-3">
                          {selectedToken?.logoUri ? (
                            <img src={selectedToken.logoUri} alt={selectedToken.symbol} className="w-5 h-5 rounded-full border border-gray-300" />
                          ) : (
                            <div className="w-5 h-5 bg-blue-100 rounded-full border border-gray-300 flex items-center justify-center">
                              <span className="text-blue-600 font-bold text-xs">{selectedToken?.symbol?.[0]}</span>
                            </div>
                          )}
                          <p className="text-sm font-medium text-gray-700">{selectedToken?.symbol} Reserve</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{(poolData.tokenReserve.toNumber() / Math.pow(10, selectedToken?.decimals || 6)).toLocaleString()}</p>
                        <p className="text-gray-600 text-sm">{selectedToken?.symbol} tokens</p>
                      </div>
                      
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-center space-x-2 mb-3">
                          <div className="w-5 h-5 bg-purple-100 rounded-full border border-gray-300 flex items-center justify-center">
                            <span className="text-purple-600 font-bold text-xs">◎</span>
                          </div>
                          <p className="text-sm font-medium text-gray-700">SOL Reserve</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{(poolData.solReserve.toNumber() / LAMPORTS_PER_SOL).toFixed(4)}</p>
                        <p className="text-gray-600 text-sm">SOL tokens</p>
                      </div>
                      
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-center space-x-2 mb-3">
                          <div className="w-5 h-5 bg-green-100 rounded-full border border-gray-300 flex items-center justify-center">
                            <span className="text-green-600 font-bold text-xs">LP</span>
                          </div>
                          <p className="text-sm font-medium text-gray-700">LP Token Supply</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{(poolData.lpSupply.toNumber() / Math.pow(10, 9)).toLocaleString()}</p>
                        <p className="text-gray-600 text-sm">LP tokens</p>
                      </div>
                      
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-sm">
                        <div className="flex items-center space-x-2 mb-3">
                          <div className="w-5 h-5 bg-orange-100 rounded-full border border-gray-300 flex items-center justify-center">
                            <span className="text-orange-600 font-bold text-xs">%</span>
                          </div>
                          <p className="text-sm font-medium text-gray-700">Fee Rate</p>
                        </div>
                        <p className="text-2xl font-bold text-gray-900">{poolData.feeRate}%</p>
                        <p className="text-gray-600 text-sm">Trading fee</p>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mt-6 shadow-sm">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <p className="text-sm font-medium text-blue-700">Pool Status: Active</p>
                      </div>
                      <p className="text-blue-600 text-sm">Your liquidity pool is now live and available for other users to trade against. You can manage your position or add more liquidity at any time.</p>
                    </div>
                  </div>
                )}

              {status && (
                <div className={`border rounded-xl p-4 mt-6 shadow-sm ${
                  status.includes('Error') 
                    ? 'bg-red-50 border-red-200 text-red-700' 
                    : 'bg-green-50 border-green-200 text-green-700'
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