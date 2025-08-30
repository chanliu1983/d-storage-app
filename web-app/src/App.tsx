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
            <div className="min-h-screen bg-gray-50">
              <Navigation />
              <main className="container mx-auto px-4 py-8 lg:px-8">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 lg:p-8 min-h-[calc(100vh-12rem)]">
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/trade" element={<TradingInterface />} />
                    <Route path="/liquidity" element={<LiquidityPool />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                  </Routes>
                </div>
              </main>
            </div>
            <Toaster 
              position="bottom-right" 
              toastOptions={{
                style: {
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  color: '#374151',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
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
