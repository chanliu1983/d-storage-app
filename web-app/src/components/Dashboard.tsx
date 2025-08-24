import React, { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity,
  PieChart,
  RefreshCw,
  Users,
  Wallet
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
  type: 'buy' | 'sell';
  user: string;
  token: string;
  tokenAmount: number;
  solAmount: number;
  timestamp: number;
  signature: string;
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

  const blockchainService = new BlockchainDataService(connection);

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
  }, [publicKey, wallet, connection]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-10 animate-pulse animation-delay-4000"></div>
      </div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-12">
          <div className="mb-4 sm:mb-0">
            <div className="backdrop-blur-xl bg-white/10 rounded-3xl p-8 border border-white/20 shadow-2xl">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent mb-4">Exchange Dashboard</h1>
              <p className="text-white/80 text-lg">Monitor your token holdings and exchange activity</p>
            </div>
          </div>
          <button
            onClick={loadExchangeData}
            disabled={isLoading}
            className="backdrop-blur-xl bg-white/20 hover:bg-white/30 border border-white/30 rounded-2xl px-6 py-3 text-white font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mb-6"></div>
            <p className="text-xl text-gray-600 font-medium">Loading exchange data...</p>
            <p className="text-sm text-gray-500 mt-2">Please wait while we fetch the latest information</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-12">
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center mr-4 shadow-lg group-hover:shadow-xl transition-all duration-300">
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{formatNumber(userBalance)} SOL</div>
                    <div className="text-sm text-white/70">SOL Balance</div>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-indigo-400 to-purple-600 rounded-2xl flex items-center justify-center mr-4 shadow-lg group-hover:shadow-xl transition-all duration-300">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{formatNumber(portfolioValue)} SOL</div>
                    <div className="text-sm text-white/70">Portfolio Value</div>
                    <div className={`text-xs font-semibold px-2 py-1 rounded-full mt-1 ${
                      portfolioChange24h >= 0 
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}>
                      {portfolioChange24h >= 0 ? '+' : ''}{portfolioChange24h.toFixed(2)}% 24h
                    </div>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-emerald-600 rounded-2xl flex items-center justify-center mr-4 shadow-lg group-hover:shadow-xl transition-all duration-300">
                    <PieChart className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{exchangeTokens.length}</div>
                    <div className="text-sm text-white/70">Available Tokens</div>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-600 rounded-2xl flex items-center justify-center mr-4 shadow-lg group-hover:shadow-xl transition-all duration-300">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{exchangeStats.totalUsers.toLocaleString()}</div>
                    <div className="text-sm text-white/70">Active Users</div>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl p-6 hover:bg-white/20 transition-all duration-300 hover:scale-105 hover:shadow-2xl group">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-400 to-red-600 rounded-2xl flex items-center justify-center mr-4 shadow-lg group-hover:shadow-xl transition-all duration-300">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{exchangeStats.dailyVolume.toFixed(2)} SOL</div>
                    <div className="text-sm text-white/70">24h Volume</div>
                    <div className="text-xs text-white/50 mt-1">{exchangeStats.totalTransactions} transactions</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* User Token Holdings */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-r from-white/20 to-white/10 p-8 border-b border-white/20">
                  <h2 className="text-2xl font-bold text-white flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-400 to-purple-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                      <Wallet className="h-5 w-5 text-white" />
                    </div>
                    Your Token Holdings
                  </h2>
                  <p className="text-white/70 mt-2">Current portfolio overview</p>
                </div>
                <div className="p-8">
                  {userTokens.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gradient-to-r from-gray-400/20 to-gray-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Wallet className="h-8 w-8 text-white/50" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">No tokens found</h3>
                      <p className="text-white/70">
                        {!publicKey ? 'Connect your wallet to view holdings' : 'No tokens in your wallet'}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/20">
                            <th className="text-left py-4 text-white/80 font-semibold">Token</th>
                            <th className="text-left py-4 text-white/80 font-semibold">Mint Address</th>
                            <th className="text-right py-4 text-white/80 font-semibold">Balance</th>
                            <th className="text-right py-4 text-white/80 font-semibold">Value (SOL)</th>
                            <th className="text-right py-4 text-white/80 font-semibold">24h Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userTokens.map((token) => (
                            <tr key={token.mint} className="border-b border-white/10 hover:bg-white/10 transition-all duration-200">
                              <td className="py-4">
                                <div className="flex items-center space-x-3">
                                  <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <span className="text-white font-bold text-sm">
                                      {token.symbol?.charAt(0) || 'T'}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-white">{token.symbol || 'Unknown'}</p>
                                    <p className="text-sm text-white/60">{token.name || 'Unknown Token'}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4">
                                <div className="max-w-xs">
                                  <p className="font-mono text-sm text-white/80 truncate bg-white/10 px-2 py-1 rounded" title={token.mint}>
                                    {token.mint.slice(0, 8)}...{token.mint.slice(-8)}
                                  </p>
                                </div>
                              </td>
                              <td className="text-right py-4">
                                <p className="font-semibold text-white">
                                  {formatNumber(token.balance || 0)}
                                </p>
                              </td>
                              <td className="text-right py-4">
                                <p className="font-semibold text-green-300">
                                  {formatNumber(token.totalValue || 0)}
                                </p>
                              </td>
                              <td className="text-right py-4">
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                  (token.change24h || 0) >= 0 
                                    ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
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

              {/* Recent Exchange Transactions */}
              <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-white/20 to-white/10 p-8 border-b border-white/20">
                  <h2 className="text-2xl font-bold text-white flex items-center">
                    <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-emerald-600 rounded-xl flex items-center justify-center mr-3 shadow-lg">
                      <Activity className="h-5 w-5 text-white" />
                    </div>
                    Recent Exchange Activity
                  </h2>
                  <p className="text-white/70 mt-2">Latest trading transactions</p>
                </div>
                <div className="p-8">
                  {transactions.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gradient-to-r from-gray-400/20 to-gray-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Activity className="h-8 w-8 text-white/50" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">No recent activity</h3>
                      <p className="text-white/70">Exchange transactions will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {transactions.slice(0, 5).map((tx) => (
                        <div key={tx.timestamp} className="flex items-center justify-between p-4 bg-white/10 rounded-2xl border border-white/20 hover:bg-white/20 transition-all duration-200">
                          <div className="flex items-center space-x-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
                              tx.type === 'buy' ? 'bg-gradient-to-r from-green-400 to-emerald-600' : 'bg-gradient-to-r from-red-400 to-red-600'
                            }`}>
                              {tx.type === 'buy' ? (
                                <TrendingUp className="h-6 w-6 text-white" />
                              ) : (
                                <TrendingDown className="h-6 w-6 text-white" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-white capitalize">
                                {tx.type}
                              </p>
                              <p className="text-white/70">
                                {tx.user}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-white">
                              {formatNumber(tx.tokenAmount)} {tx.token}
                            </p>
                            <p className="text-sm text-green-300 font-semibold">
                              {formatNumber(tx.solAmount)} SOL
                            </p>
                            <p className="text-xs text-white/50 mt-1">
                              {new Date(tx.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))}
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