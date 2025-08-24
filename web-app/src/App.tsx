// import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { Toaster } from 'sonner';

// Import components
import Navigation from './components/Navigation';
import TradingInterface from './components/TradingInterface';
import LiquidityPool from './components/LiquidityPool';
import Dashboard from './components/Dashboard';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

function App() {
  // Use devnet for development
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = clusterApiUrl(network);

  const wallets = [
    new PhantomWalletAdapter(),
  ];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Router>
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
              {/* Animated background elements */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 animate-pulse"></div>
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/50 via-transparent to-transparent"></div>
              <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-l from-blue-500/30 to-transparent rounded-full blur-3xl"></div>
              <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-full blur-2xl animate-pulse"></div>
              
              {/* Main content */}
              <div className="relative z-10">
                <Navigation />
                <main className="container mx-auto px-4 py-8 lg:px-8">
                  <div className="backdrop-blur-sm bg-white/5 rounded-3xl border border-white/10 shadow-2xl p-6 lg:p-8 min-h-[calc(100vh-12rem)]">
                    <Routes>
                      <Route path="/" element={<Navigate to="/dashboard" replace />} />
                      <Route path="/trade" element={<TradingInterface />} />
                      <Route path="/liquidity" element={<LiquidityPool />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                    </Routes>
                  </div>
                </main>
              </div>
            </div>
            <Toaster 
              position="bottom-right" 
              toastOptions={{
                style: {
                  background: 'rgba(15, 23, 42, 0.9)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'white',
                },
              }}
            />
          </Router>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
