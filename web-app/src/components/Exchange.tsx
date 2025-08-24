import React, { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';
import { Store, ShoppingCart, Coins, RefreshCw } from 'lucide-react';

interface ExchangeToken {
  mint: string;
  name: string;
  symbol: string;
  balance: number;
  price: number; // Price in SOL
  decimals: number;
  logoUri?: string;
}

interface PurchaseForm {
  selectedToken: string;
  solAmount: number;
  tokenAmount: number;
}

const Exchange: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [exchangeTokens, setExchangeTokens] = useState<ExchangeToken[]>([]);
  const [userSolBalance, setUserSolBalance] = useState(0);
  
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>({
    selectedToken: '',
    solAmount: 0,
    tokenAmount: 0
  });

  // Mock exchange account data - in production this would come from the blockchain
  const mockExchangeTokens: ExchangeToken[] = [
    {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      name: 'USD Coin',
      symbol: 'USDC',
      balance: 50000,
      price: 0.000025, // 0.000025 SOL per USDC
      decimals: 6,
      logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
    },
    {
      mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      name: 'Tether USD',
      symbol: 'USDT',
      balance: 75000,
      price: 0.000025, // 0.000025 SOL per USDT
      decimals: 6,
      logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png'
    },
    {
      mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
      name: 'Marinade Staked SOL',
      symbol: 'mSOL',
      balance: 1000,
      price: 0.95, // 0.95 SOL per mSOL
      decimals: 9,
      logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png'
    },
    {
      mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      name: 'Bonk',
      symbol: 'BONK',
      balance: 1000000000,
      price: 0.000000001, // Very small price for meme token
      decimals: 5,
      logoUri: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I'
    },
    {
      mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
      name: 'Jito Staked SOL',
      symbol: 'JitoSOL',
      balance: 800,
      price: 1.05, // 1.05 SOL per JitoSOL
      decimals: 9
    }
  ];

  const loadExchangeData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      setExchangeTokens(mockExchangeTokens);
    } catch (error) {
      console.error('Error loading exchange data:', error);
      toast.error('Failed to load exchange data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadUserBalance = useCallback(async () => {
    if (!publicKey) return;
    
    try {
      const balance = await connection.getBalance(publicKey);
      setUserSolBalance(balance / 1e9); // Convert lamports to SOL
    } catch (error) {
      console.error('Error loading user balance:', error);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    loadExchangeData();
    if (publicKey) {
      loadUserBalance();
    }
  }, [publicKey, loadExchangeData, loadUserBalance]);

  const handleTokenSelect = (tokenMint: string) => {
    const token = exchangeTokens.find(t => t.mint === tokenMint);
    if (token) {
      setPurchaseForm(prev => ({
        ...prev,
        selectedToken: tokenMint,
        tokenAmount: prev.solAmount / token.price
      }));
    }
  };

  const handleSolAmountChange = (amount: number) => {
    const token = exchangeTokens.find(t => t.mint === purchaseForm.selectedToken);
    if (token) {
      setPurchaseForm({
        selectedToken: purchaseForm.selectedToken,
        solAmount: amount,
        tokenAmount: amount / token.price
      });
    }
  };

  const handlePurchase = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (!purchaseForm.selectedToken || purchaseForm.solAmount <= 0) {
      toast.error('Please select a token and enter a valid SOL amount');
      return;
    }

    const token = exchangeTokens.find(t => t.mint === purchaseForm.selectedToken);
    if (!token) {
      toast.error('Selected token not found');
      return;
    }

    if (purchaseForm.solAmount > userSolBalance) {
      toast.error('Insufficient SOL balance');
      return;
    }

    if (purchaseForm.tokenAmount > token.balance) {
      toast.error('Insufficient token balance in exchange');
      return;
    }

    setIsPurchasing(true);
    
    try {
      // In a real implementation, this would call the smart contract
      // For now, we'll simulate the transaction
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update local state to reflect the purchase
      setExchangeTokens(prev => 
        prev.map(t => 
          t.mint === purchaseForm.selectedToken 
            ? { ...t, balance: t.balance - purchaseForm.tokenAmount }
            : t
        )
      );
      
      // Reset form
      setPurchaseForm({
        selectedToken: '',
        solAmount: 0,
        tokenAmount: 0
      });
      
      // Reload user balance
      await loadUserBalance();
      
      toast.success(`Successfully purchased ${purchaseForm.tokenAmount.toFixed(6)} ${token.symbol}!`);
      
    } catch (error) {
      console.error('Error purchasing token:', error);
      toast.error('Failed to purchase token. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const selectedToken = exchangeTokens.find(t => t.mint === purchaseForm.selectedToken);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-12">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <div className="icon-container-blue">
              <Store className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-display">
              Token Exchange
            </h1>
          </div>
          <p className="text-subtitle max-w-3xl mx-auto">
            Buy tokens directly from our exchange account using SOL. All tokens are pre-stored and ready for immediate purchase.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Exchange Inventory */}
        <div className="xl:col-span-2">
          <div className="card-primary">
            <div className="card-header">
              <div className="flex items-center space-x-4">
                <div className="icon-container-blue">
                  <Store className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-heading">
                    Exchange Inventory
                  </h2>
                  <p className="text-muted">Available tokens for immediate purchase</p>
                </div>
              </div>
              <button
                onClick={loadExchangeData}
                disabled={isLoading}
                className="btn-secondary"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {isLoading ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p className="text-muted font-medium">Loading exchange inventory...</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table-primary">
                  <thead className="table-header">
                    <tr>
                      <th className="table-cell-header">
                        Token
                      </th>
                      <th className="table-cell-header">
                        Balance
                      </th>
                      <th className="table-cell-header">
                        Price (SOL)
                      </th>
                      <th className="table-cell-header">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {exchangeTokens.map((token) => (
                      <tr key={token.mint} className="table-row">
                        <td className="table-cell">
                          <div className="flex items-center space-x-4">
                            <div className="icon-container-purple">
                              <span className="text-white text-lg font-bold">
                                {token.symbol.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <div className="text-title">{token.symbol}</div>
                              <div className="text-muted">{token.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="table-cell">
                          <span className="text-title">
                            {token.balance.toLocaleString()}
                          </span>
                        </td>
                        <td className="table-cell">
                          <span className="text-title">
                            {token.price.toFixed(9)}
                          </span>
                        </td>
                        <td className="table-cell">
                          <button
                            onClick={() => handleTokenSelect(token.mint)}
                            className="btn-primary"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Purchase Form */}
        <div className="xl:col-span-1">
          <div className="card-primary sticky top-6">
            <div className="card-header">
              <div className="icon-container-green">
                <ShoppingCart className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-heading">
                  Purchase Form
                </h2>
                <p className="text-muted">Buy tokens with SOL</p>
              </div>
            </div>

            {publicKey ? (
              <div className="space-y-8">
                {/* User SOL Balance */}
                <div className="card-secondary">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="icon-container-blue">
                        <Coins className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-label">
                        Your SOL Balance
                      </span>
                    </div>
                    <span className="text-display-sm">
                      {userSolBalance.toFixed(4)} SOL
                    </span>
                  </div>
                </div>

                {/* Selected Token */}
                {selectedToken && (
                  <div className="card-success">
                    <div className="flex items-center space-x-4 mb-4">
                      <div className="icon-container-green-lg">
                        <span className="text-white text-xl font-bold">
                          {selectedToken.symbol.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="text-title">
                          {selectedToken.symbol}
                        </div>
                        <div className="text-muted">
                          {selectedToken.name}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/70 rounded-xl p-4">
                      <div className="text-label mb-1">Token Price</div>
                      <div className="text-title">
                        {selectedToken.price} SOL per token
                      </div>
                    </div>
                  </div>
                )}

                {/* SOL Amount Input */}
                <div className="space-y-3">
                  <label className="text-label block">
                    SOL Amount to Spend
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Coins className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      value={purchaseForm.solAmount}
                      onChange={(e) => handleSolAmountChange(Number(e.target.value))}
                      placeholder="Enter SOL amount"
                      className="input-primary pl-12"
                      step="0.001"
                      min="0"
                      max={userSolBalance}
                    />
                  </div>
                </div>

                {/* Purchase Calculation */}
                {selectedToken && purchaseForm.solAmount > 0 && (
                  <div className="card-warning">
                    <div className="text-center">
                      <div className="text-muted mb-2">
                        You will receive approximately:
                      </div>
                      <div className="text-display mb-2">
                        {purchaseForm.tokenAmount.toFixed(6)}
                      </div>
                      <div className="text-title text-purple-600">
                        {selectedToken.symbol}
                      </div>
                    </div>
                  </div>
                )}

                {/* Purchase Button */}
                <button
                  onClick={handlePurchase}
                  disabled={!selectedToken || !purchaseForm.solAmount || purchaseForm.solAmount <= 0 || purchaseForm.solAmount > userSolBalance || isPurchasing}
                  className="btn-success btn-large w-full"
                >
                  {isPurchasing ? (
                    <div className="flex items-center justify-center space-x-3">
                      <div className="loading-spinner-sm"></div>
                      <span>Processing Purchase...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <ShoppingCart className="h-5 w-5" />
                      <span>Purchase Tokens</span>
                    </div>
                  )}
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <Coins className="empty-state-icon" />
                <p className="text-muted mb-4">
                  Connect your wallet to start purchasing tokens
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Exchange;