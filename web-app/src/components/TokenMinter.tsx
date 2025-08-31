import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { Coins, Send, CheckCircle, AlertCircle, Upload, X } from 'lucide-react';
import { createTokenMinter } from '../utils/tokenMinter';

interface MintResult {
  mintAddress: string;
  signature: string;
  recipientTokenAccount: string;
}

const TokenMinter: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isMinting, setIsMinting] = useState(false);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [recipientAddress, setRecipientAddress] = useState('Au7pLCPAEz5fMKactnUEBpZXNvg6Azgt8cGDvG4KANkT');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenIcon, setTokenIcon] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  const validateSymbol = (symbol: string): boolean => {
    const symbolRegex = /^[A-Za-z0-9]{3,10}$/;
    return symbolRegex.test(symbol);
  };

  const handleIconUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PNG, JPG, or SVG file');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be less than 2MB');
      return;
    }

    setTokenIcon(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setIconPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeIcon = () => {
    setTokenIcon(null);
    setIconPreview(null);
  };

  const handleMint1000Tokens = async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!recipientAddress.trim()) {
      toast.error('Please enter a recipient address');
      return;
    }

    if (tokenSymbol && !validateSymbol(tokenSymbol)) {
      toast.error('Token symbol must be 3-10 alphanumeric characters');
      return;
    }

    setIsMinting(true);
    setMintResult(null);

    try {
      const tokenMinter = createTokenMinter(connection);
      
      toast.info('Creating new token mint and minting 1000 tokens...');
      
      const result = await tokenMinter.createAndMintToken(
        {
          publicKey: wallet.publicKey,
          sendTransaction: wallet.sendTransaction,
        },
        recipientAddress,
        1000,
        tokenSymbol ? `${tokenSymbol} Token` : 'Custom Token 1000',
        tokenSymbol || 'CT1000',
        9
      );

      if (result.success && result.mintAddress && result.signature && result.recipientTokenAccount) {
        setMintResult({
          mintAddress: result.mintAddress,
          signature: result.signature,
          recipientTokenAccount: result.recipientTokenAccount,
        });
        
        toast.success(`Successfully minted 1000 ${tokenSymbol || 'custom'} tokens!`);
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error minting tokens:', error);
      toast.error(`Failed to mint tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsMinting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Token Minter
        </h1>
        <p className="text-gray-600">
          Create a new SPL token with custom symbol and icon, then mint 1000 tokens to a specified wallet address.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Coins className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">
            Mint 1000 Tokens
          </h2>
        </div>

        <div className="space-y-6">
          {/* Token Symbol */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Token Symbol (Optional)
            </label>
            <input
              type="text"
              value={tokenSymbol}
              onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
              placeholder="e.g., BTC, ETH, SOL"
              maxLength={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm uppercase"
            />
            <p className="text-xs text-gray-500 mt-1">
              3-10 alphanumeric characters (optional)
            </p>
            {tokenSymbol && !validateSymbol(tokenSymbol) && (
              <p className="text-xs text-red-500 mt-1">
                Symbol must be 3-10 alphanumeric characters
              </p>
            )}
          </div>

          {/* Token Icon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Token Icon (Optional)
            </label>
            <div className="flex items-start space-x-4">
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  onChange={handleIconUpload}
                  className="hidden"
                  id="icon-upload"
                />
                <label
                  htmlFor="icon-upload"
                  className="w-full border-2 border-dashed border-gray-300 rounded-md p-4 text-center cursor-pointer hover:border-blue-400 transition-colors"
                >
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    Click to upload icon
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PNG, JPG, SVG (max 2MB)
                  </p>
                </label>
              </div>
              
              {iconPreview && (
                <div className="relative">
                  <img
                    src={iconPreview}
                    alt="Token icon preview"
                    className="w-16 h-16 rounded-md border border-gray-300 object-cover"
                  />
                  <button
                    onClick={removeIcon}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Recipient Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient Wallet Address
            </label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Enter wallet address to receive tokens"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Default address: Au7pLCPAEz5fMKactnUEBpZXNvg6Azgt8cGDvG4KANkT
            </p>
          </div>

          {/* Mint Button */}
          <button
            onClick={handleMint1000Tokens}
            disabled={isMinting || !wallet.publicKey}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isMinting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Minting Tokens...</span>
              </>
            ) : (
              <>
                <Send className="h-5 w-5" />
                <span>Mint 1000 Tokens</span>
              </>
            )}
          </button>

          {!wallet.publicKey && (
            <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 p-3 rounded-md">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">Please connect your wallet to mint tokens</span>
            </div>
          )}
        </div>

        {/* Mint Result */}
        {mintResult && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-center space-x-2 mb-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <h3 className="font-medium text-green-900">Tokens Minted Successfully!</h3>
            </div>
            
            <div className="space-y-3 text-sm">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Token Mint Address:</label>
                <div className="flex items-center space-x-2">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono flex-1 break-all">
                    {mintResult.mintAddress}
                  </code>
                  <button
                    onClick={() => copyToClipboard(mintResult.mintAddress, 'Mint address')}
                    className="text-blue-600 hover:text-blue-800 text-xs"
                  >
                    Copy
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block font-medium text-gray-700 mb-1">Transaction Signature:</label>
                <div className="flex items-center space-x-2">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono flex-1 break-all">
                    {mintResult.signature}
                  </code>
                  <button
                    onClick={() => copyToClipboard(mintResult.signature, 'Transaction signature')}
                    className="text-blue-600 hover:text-blue-800 text-xs"
                  >
                    Copy
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block font-medium text-gray-700 mb-1">Recipient Token Account:</label>
                <div className="flex items-center space-x-2">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono flex-1 break-all">
                    {mintResult.recipientTokenAccount}
                  </code>
                  <button
                    onClick={() => copyToClipboard(mintResult.recipientTokenAccount, 'Token account')}
                    className="text-blue-600 hover:text-blue-800 text-xs"
                  >
                    Copy
                  </button>
                </div>
              </div>
              
              <div className="pt-2 border-t border-green-200">
                <p className="text-green-700">
                  ✅ Successfully minted 1000 {tokenSymbol || 'custom'} tokens to the recipient address!
                </p>
                {tokenSymbol && (
                  <p className="text-sm text-gray-600 mt-1">
                    Token Symbol: <span className="font-mono font-semibold">{tokenSymbol}</span>
                  </p>
                )}
                {tokenIcon && (
                  <p className="text-sm text-gray-600 mt-1">
                    Token Icon: <span className="text-green-600">✓ Uploaded</span>
                  </p>
                )}
                <p className="text-xs text-gray-600 mt-1">
                  You can view this transaction on{' '}
                  <a
                    href={`https://explorer.solana.com/tx/${mintResult.signature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Solana Explorer
                  </a>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenMinter;