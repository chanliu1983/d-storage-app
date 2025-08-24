import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createInitializeMintInstruction, MintLayout, getMinimumBalanceForRentExemptMint } from '@solana/spl-token';
import { toast } from 'sonner';
import { Upload, Coins, Plus, Check } from 'lucide-react';

interface TokenForm {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
  description: string;
  logoFile: File | null;
}

const TokenManagement: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [isCreating, setIsCreating] = useState(false);
  const [createdTokens, setCreatedTokens] = useState<Array<{mint: string, name: string, symbol: string}>>([]);
  
  const [form, setForm] = useState<TokenForm>({
    name: '',
    symbol: '',
    decimals: 9,
    initialSupply: 1000000,
    description: '',
    logoFile: null
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'decimals' || name === 'initialSupply' ? Number(value) : value
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setForm(prev => ({ ...prev, logoFile: file }));
  };

  const createToken = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!form.name || !form.symbol) {
      toast.error('Please fill in token name and symbol');
      return;
    }

    setIsCreating(true);
    
    try {
      // Generate a new mint keypair
      const mintKeypair = Keypair.generate();
      
      // Get minimum balance for rent exemption
      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      
      // Create account instruction
      const createAccountInstruction = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MintLayout.span,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      });
      
      // Initialize mint instruction
      const initializeMintInstruction = createInitializeMintInstruction(
        mintKeypair.publicKey,
        form.decimals,
        publicKey,
        publicKey,
        TOKEN_PROGRAM_ID
      );
      
      // Create transaction
      const transaction = new (await import('@solana/web3.js')).Transaction().add(
        createAccountInstruction,
        initializeMintInstruction
      );
      
      // Send transaction
      const signature = await sendTransaction(transaction, connection, {
        signers: [mintKeypair]
      });
      
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Add to created tokens list
      const newToken = {
        mint: mintKeypair.publicKey.toString(),
        name: form.name,
        symbol: form.symbol
      };
      
      setCreatedTokens(prev => [...prev, newToken]);
      
      // Reset form
      setForm({
        name: '',
        symbol: '',
        decimals: 9,
        initialSupply: 1000000,
        description: '',
        logoFile: null
      });
      
      toast.success(`Token ${form.symbol} created successfully!`);
      
    } catch (error) {
      console.error('Error creating token:', error);
      toast.error('Failed to create token. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Token Management
        </h1>
        <p className="text-gray-600">
          Create custom SPL tokens with metadata and configure initial parameters.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Token Creation Form */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Plus className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Create New Token
            </h2>
          </div>

          <div className="space-y-4">
            {/* Token Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Token Name
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleInputChange}
                placeholder="e.g., My Custom Token"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Token Symbol */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Token Symbol
              </label>
              <input
                type="text"
                name="symbol"
                value={form.symbol}
                onChange={handleInputChange}
                placeholder="e.g., MCT"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Decimals */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Decimals
              </label>
              <input
                type="number"
                name="decimals"
                value={form.decimals}
                onChange={handleInputChange}
                min="0"
                max="18"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Initial Supply */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Initial Supply
              </label>
              <input
                type="number"
                name="initialSupply"
                value={form.initialSupply}
                onChange={handleInputChange}
                min="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleInputChange}
                placeholder="Describe your token..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Token Logo
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="logo-upload"
                />
                <label
                  htmlFor="logo-upload"
                  className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50"
                >
                  <Upload className="h-4 w-4" />
                  <span>{form.logoFile ? form.logoFile.name : 'Choose file'}</span>
                </label>
              </div>
            </div>

            {/* Create Button */}
            <button
              onClick={createToken}
              disabled={isCreating || !publicKey}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Coins className="h-4 w-4" />
                  <span>Create Token</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Created Tokens List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center space-x-2 mb-6">
            <Check className="h-6 w-6 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              Created Tokens
            </h2>
          </div>

          {createdTokens.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                No tokens created yet. Create your first token to get started!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {createdTokens.map((token, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {token.name} ({token.symbol})
                      </h3>
                      <p className="text-sm text-gray-500 font-mono">
                        {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                        Active
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenManagement;