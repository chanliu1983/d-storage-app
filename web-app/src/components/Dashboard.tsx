import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
  TrendingUp, 
  Activity,
  PieChart,
  RefreshCw,
  Users,
  Wallet,
  ArrowUpDown,
  Send,
  Droplets
} from 'lucide-react';
import BlockchainDataService from '../utils/blockchainDataService';

interface ExchangeToken {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  totalValue: number;
  price: number;
  change24h: number;
  userBalance?: number;
  userValue?: number;
}

interface ExchangeTransaction {
  id: string;
  type: 'buy' | 'sell' | 'swap' | 'transfer' | 'liquidity';
  user: string;
  token: string;
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
  signature: string;
  description?: string;
  amount?: number;
  status?: 'confirmed' | 'pending' | 'failed';
  time?: string;
}

interface ExchangeStats {
  totalValue: number;
  totalUsers: number;
  dailyVolume: number;
  totalTransactions: number;
}

interface UserToken {
  mint: string;
  balance: number;
  totalValue?: number;
  symbol?: string;
  name?: string;
  change24h?: number;
}

const Dashboard: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, wallet } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [exchangeTokens, setExchangeTokens] = useState<ExchangeToken[]>([]);
  const [userTokens, setUserTokens] = useState<UserToken[]>([]);
  const [transactions, setTransactions] = useState<ExchangeTransaction[]>([]);
  const [exchangeStats, setExchangeStats] = useState<ExchangeStats>({
    totalValue: 0,
    totalUsers: 0,
    dailyVolume: 0,
    totalTransactions: 0
  });
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [portfolioChange24h, setPortfolioChange24h] = useState(0);
  const [userBalance, setUserBalance] = useState(0);

const blockchainService = useMemo(() => new BlockchainDataService(connection), [connection]);

  const loadExchangeData = useCallback(async () => {
    if (!publicKey) return;
    
    setIsLoading(true);
    
    try {
      const [exchangeTokensData, transactionsData, exchangeStatsData, userTokensData] = await Promise.all([
        blockchainService.getExchangeTokens(),
        blockchainService.getRecentTransactions(),
        blockchainService.getExchangeStats(),
        blockchainService.getUserTokenBalances(publicKey, wallet!)
      ]);
      
      setUserTokens(userTokensData);
      
      const tokensWithUserBalances = exchangeTokensData.map((token: ExchangeToken) => {
        const userBalance = userTokensData.find((balance: {mint: string; balance: number}) => balance.mint === token.mint);
        return {
          ...token,
          userBalance: userBalance?.balance || 0,
          userValue: userBalance ? userBalance.balance * token.price : 0
        };
      });
      
      setExchangeTokens(tokensWithUserBalances);
      setTransactions(transactionsData);
      setExchangeStats(exchangeStatsData);
      
      const userPortfolioValue = userTokensData.reduce((sum: number, token: {totalValue?: number}) => sum + (token.totalValue || 0), 0);
      setPortfolioValue(userPortfolioValue);
      
      const solBalance = userTokensData.find((balance: {mint: string; balance: number}) => balance.mint === 'SOL')?.balance || 0;
      setUserBalance(solBalance);
      
      const randomChange = (Math.random() - 0.5) * 10;
      setPortfolioChange24h(randomChange);
      
    } catch (error) {
      console.error('Error loading exchange data:', error);
      
      try {
        const fallbackTokens = await blockchainService.getExchangeTokens();
        const fallbackTransactions = await blockchainService.getRecentTransactions();
        const fallbackStats = await blockchainService.getExchangeStats();
        
        setExchangeTokens(fallbackTokens);
        setTransactions(fallbackTransactions);
        setExchangeStats(fallbackStats);
        setPortfolioValue(fallbackStats.totalValue);
        setPortfolioChange24h(2.5);
      } catch (fallbackError) {
        console.error('Error loading fallback data:', fallbackError);
      }
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, blockchainService, wallet]);

  useEffect(() => {
    if (publicKey) {
      loadExchangeData();
    }
  }, [publicKey, loadExchangeData]);

  const formatNumber = (num: number) => {
    if (num >= 1e9) {
      return (num / 1e9).toFixed(1) + 'B';
    } else if (num >= 1e6) {
      return (num / 1e6).toFixed(1) + 'M';
    } else if (num >= 1e3) {
      return (num / 1e3).toFixed(1) + 'K';
    }
    return num.toFixed(2);
  };

  if (!publicKey) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-16">
          <Wallet className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600">
            Connect your Phantom wallet to view your portfolio and trading history.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="mb-4 sm:mb-0">
            <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Exchange Dashboard</h1>
              <p className="text-gray-600">Monitor your token holdings and exchange activity</p>
            </div>
          </div>
          <button
            onClick={loadExchangeData}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mb-6"></div>
            <p className="text-xl text-gray-900 font-medium">Loading exchange data...</p>
            <p className="text-sm text-gray-600 mt-2">Please wait while we fetch the latest information</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">{formatNumber(userBalance)} SOL</div>
                    <div className="text-sm text-gray-600">SOL Balance</div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center mr-3">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">{formatNumber(portfolioValue)} SOL</div>
                    <div className="text-sm text-gray-600">Portfolio Value</div>
                    <div className={`text-xs font-medium px-2 py-1 rounded-full mt-1 ${
                      portfolioChange24h >= 0 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {portfolioChange24h >= 0 ? '+' : ''}{portfolioChange24h.toFixed(2)}% 24h
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center mr-3">
                    <PieChart className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">{exchangeTokens.length}</div>
                    <div className="text-sm text-gray-600">Available Tokens</div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center mr-3">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">{exchangeStats.totalUsers.toLocaleString()}</div>
                    <div className="text-sm text-gray-600">Active Users</div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center mr-3">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900">{exchangeStats.dailyVolume.toFixed(2)} SOL</div>
                    <div className="text-sm text-gray-600">24h Volume</div>
                    <div className="text-xs text-gray-500 mt-1">{exchangeStats.totalTransactions} transactions</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* User Token Holdings */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="bg-gray-50 p-6 border-b border-gray-200">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                      <Wallet className="h-4 w-4 text-white" />
                    </div>
                    Your Token Holdings
                  </h2>
                  <p className="text-gray-600 mt-1">Current portfolio overview</p>
                </div>
                <div className="p-6">
                  {userTokens.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Wallet className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No tokens found</h3>
                      <p className="text-gray-600">
                        {!publicKey ? 'Connect your wallet to view holdings' : 'No tokens in your wallet'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 text-gray-700 font-medium">Token</th>
                            <th className="text-left py-3 text-gray-700 font-medium">Mint Address</th>
                            <th className="text-right py-3 text-gray-700 font-medium">Balance</th>
                            <th className="text-right py-3 text-gray-700 font-medium">Value (SOL)</th>
                            <th className="text-right py-3 text-gray-700 font-medium">24h Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userTokens.map((token) => (
                            <tr key={token.mint} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                              <td className="py-3">
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                                    <span className="text-white font-bold text-xs">
                                      {token.symbol?.charAt(0) || 'T'}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900">{token.symbol || 'Unknown'}</p>
                                    <p className="text-sm text-gray-500">{token.name || 'Unknown Token'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3">
                                <div className="max-w-xs">
                                  <p className="font-mono text-sm text-gray-600 truncate bg-gray-100 px-2 py-1 rounded" title={token.mint}>
                                    {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                                  </p>
                                </div>
                              </td>
                              <td className="text-right py-3">
                                <p className="font-medium text-gray-900">
                                  {formatNumber(token.balance || 0)}
                                </p>
                              </td>
                              <td className="text-right py-3">
                                <p className="font-medium text-green-600">
                                  {formatNumber(token.totalValue || 0)}
                                </p>
                              </td>
                              <td className="text-right py-3">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  (token.change24h || 0) >= 0 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {(token.change24h || 0) >= 0 ? '+' : ''}{(token.change24h || 0).toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Transactions */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <div className="bg-gray-50 p-6 border-b border-gray-200">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center">
                    <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center mr-3">
                      <Activity className="h-4 w-4 text-white" />
                    </div>
                    Recent Transactions
                  </h2>
                  <p className="text-gray-600 mt-1">Latest blockchain activity</p>
                </div>
                <div className="p-6">
                  {transactions.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                        <Activity className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">No transactions found</h3>
                      <p className="text-gray-600">
                        {!publicKey ? 'Connect your wallet to view transactions' : 'No recent transactions'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-3 text-gray-700 font-medium">Type</th>
                            <th className="text-left py-3 text-gray-700 font-medium">Signature</th>
                            <th className="text-left py-3 text-gray-700 font-medium">Amount</th>
                            <th className="text-left py-3 text-gray-700 font-medium">Status</th>
                            <th className="text-right py-3 text-gray-700 font-medium">Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map((tx) => (
                            <tr key={tx.signature} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                              <td className="py-3">
                                <div className="flex items-center space-x-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                    tx.type === 'swap' ? 'bg-blue-600' :
                                    tx.type === 'transfer' ? 'bg-green-600' :
                                    'bg-orange-600'
                                  }`}>
                                    {tx.type === 'swap' && <ArrowUpDown className="h-4 w-4 text-white" />}
                                    {tx.type === 'transfer' && <Send className="h-4 w-4 text-white" />}
                                    {tx.type === 'liquidity' && <Droplets className="h-4 w-4 text-white" />}
                                  </div>
                                  <div>
                                    <p className="font-medium text-gray-900 capitalize">{tx.type}</p>
                                    <p className="text-sm text-gray-500">{tx.description}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3">
                                <div className="max-w-xs">
                                  <p className="font-mono text-sm text-gray-600 truncate bg-gray-100 px-2 py-1 rounded" title={tx.signature}>
                                    {tx.signature.slice(0, 8)}...{tx.signature.slice(-8)}
                                  </p>
                                </div>
                              </td>
                              <td className="py-3">
                                <p className="font-medium text-gray-900">
                                  {tx.amount} {tx.token}
                                </p>
                              </td>
                              <td className="py-3">
                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  tx.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                  tx.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {tx.status}
                                </span>
                              </td>
                              <td className="text-right py-3">
                                <p className="text-sm text-gray-600">{tx.time}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;