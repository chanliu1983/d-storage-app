import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  MintLayout,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';
import type { SendTransactionOptions } from '@solana/wallet-adapter-base';

interface TokenMintResult {
  success: boolean;
  mintAddress?: string;
  signature?: string;
  error?: string;
  recipientTokenAccount?: string;
}

interface WalletAdapter {
  publicKey: PublicKey | null;
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: SendTransactionOptions
  ) => Promise<string>;
}

export class TokenMinter {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Creates a new token mint, mints specified amount, and transfers to recipient
   * @param wallet - Connected wallet adapter
   * @param recipientAddress - Address to receive the tokens
   * @param tokenAmount - Amount of tokens to mint (in token units, not raw units)
   * @param tokenName - Name of the token
   * @param tokenSymbol - Symbol of the token
   * @param decimals - Number of decimal places (default: 9)
   * @returns Promise with mint result
   */
  async createAndMintToken(
    wallet: WalletAdapter,
    recipientAddress: string,
    tokenAmount: number,
    tokenName: string = 'Custom Token',
    tokenSymbol: string = 'CUSTOM',
    decimals: number = 9
  ): Promise<TokenMintResult> {
    try {
      if (!wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      // Validate recipient address
      let recipientPubkey: PublicKey;
      try {
        recipientPubkey = new PublicKey(recipientAddress);
      } catch (error) {
        throw new Error('Invalid recipient address format');
      }

      console.log('Starting token creation process...');
      console.log('Payer:', wallet.publicKey.toString());
      console.log('Recipient:', recipientPubkey.toString());
      console.log('Token amount:', tokenAmount);
      console.log('Decimals:', decimals);

      // Generate a new mint keypair
      const mintKeypair = Keypair.generate();
      console.log('Generated mint address:', mintKeypair.publicKey.toString());

      // Calculate raw token amount (multiply by 10^decimals)
      const rawTokenAmount = tokenAmount * Math.pow(10, decimals);
      console.log('Raw token amount:', rawTokenAmount);

      // Get minimum balance for rent exemption
      const lamports = await getMinimumBalanceForRentExemptMint(this.connection);
      console.log('Rent exempt lamports needed:', lamports);

      // Get recipient's associated token account address
      const recipientTokenAccount = await getAssociatedTokenAddress(
        mintKeypair.publicKey,
        recipientPubkey
      );
      console.log('Recipient token account:', recipientTokenAccount.toString());

      // Check if recipient token account exists
      const recipientAccountInfo = await this.connection.getAccountInfo(recipientTokenAccount);
      const needsTokenAccount = !recipientAccountInfo;
      console.log('Needs to create token account:', needsTokenAccount);

      // Create transaction
      const transaction = new Transaction();

      // 1. Create mint account
      const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MintLayout.span,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      });
      transaction.add(createAccountInstruction);

      // 2. Initialize mint
      const initializeMintInstruction = createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        wallet.publicKey, // mint authority
        wallet.publicKey, // freeze authority
        TOKEN_PROGRAM_ID
      );
      transaction.add(initializeMintInstruction);

      // 3. Create associated token account for recipient if needed
      if (needsTokenAccount) {
        const createTokenAccountInstruction = createAssociatedTokenAccountInstruction(
          wallet.publicKey, // payer
          recipientTokenAccount, // associated token account
          recipientPubkey, // owner
          mintKeypair.publicKey // mint
        );
        transaction.add(createTokenAccountInstruction);
      }

      // 4. Mint tokens to recipient
      const mintToInstruction = createMintToInstruction(
        mintKeypair.publicKey, // mint
        recipientTokenAccount, // destination
        wallet.publicKey, // authority
        rawTokenAmount // amount in raw units
      );
      transaction.add(mintToInstruction);

      console.log('Transaction created with', transaction.instructions.length, 'instructions');

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Send transaction
      console.log('Sending transaction...');
      const signature = await wallet.sendTransaction(transaction, this.connection, {
        signers: [mintKeypair],
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      console.log('Transaction sent with signature:', signature);

      // Confirm transaction
      console.log('Confirming transaction...');
      const confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      console.log('Transaction confirmed successfully!');

      // Verify the token account balance
      try {
        const tokenBalance = await this.connection.getTokenAccountBalance(recipientTokenAccount);
        console.log('Recipient token balance:', tokenBalance.value.uiAmount);
      } catch (error) {
        console.warn('Could not verify token balance:', error);
      }

      return {
        success: true,
        mintAddress: mintKeypair.publicKey.toString(),
        signature,
        recipientTokenAccount: recipientTokenAccount.toString(),
      };

    } catch (error) {
      console.error('Error in createAndMintToken:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Quick function to mint 1000 tokens to a specific address
   * @param wallet - Connected wallet adapter
   * @param recipientAddress - Address to receive the tokens
   * @returns Promise with mint result
   */
  async mint1000Tokens(
    wallet: WalletAdapter,
    recipientAddress: string
  ): Promise<TokenMintResult> {
    return this.createAndMintToken(
      wallet,
      recipientAddress,
      1000,
      'Custom Token 1000',
      'CT1000',
      9
    );
  }
}

// Export a default instance
export const createTokenMinter = (connection: Connection) => new TokenMinter(connection);