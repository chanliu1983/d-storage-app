import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Store, ArrowLeftRight, Droplets, Home } from 'lucide-react';

const Navigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/trade', label: 'Trading', icon: ArrowLeftRight },
    { path: '/liquidity', label: 'Liquidity', icon: Droplets },
  ];

  return (
    <nav className="backdrop-blur-md bg-white/10 border-b border-white/20 shadow-xl sticky top-0 z-50">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <div className="flex items-center space-x-3 group">
            <div className="p-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg group-hover:shadow-purple-500/25 transition-all duration-300">
              <Store className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Centralized Token Exchange
            </span>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group relative flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30 shadow-lg backdrop-blur-sm'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white hover:backdrop-blur-sm hover:border hover:border-white/20 hover:shadow-lg'
                  }`}
                >
                  <Icon className={`h-4 w-4 transition-all duration-300 ${
                    isActive ? 'text-purple-300' : 'group-hover:text-purple-300'
                  }`} />
                  <span className="relative z-10">{item.label}</span>
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 rounded-xl blur-sm"></div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Wallet Connection */}
          <div className="flex items-center">
            <div className="relative">
              <WalletMultiButton className="!bg-gradient-to-r !from-purple-600 !to-pink-600 hover:!from-purple-700 hover:!to-pink-700 !border-0 !rounded-xl !px-6 !py-2.5 !font-medium !shadow-lg hover:!shadow-purple-500/25 !transition-all !duration-300 !backdrop-blur-sm" />
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-6 pt-2">
          <div className="flex flex-wrap gap-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group relative flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30 shadow-lg backdrop-blur-sm'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white hover:backdrop-blur-sm hover:border hover:border-white/20 hover:shadow-lg'
                  }`}
                >
                  <Icon className={`h-4 w-4 transition-all duration-300 ${
                    isActive ? 'text-purple-300' : 'group-hover:text-purple-300'
                  }`} />
                  <span className="relative z-10">{item.label}</span>
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 rounded-lg blur-sm"></div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;