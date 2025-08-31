import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Store, ArrowLeftRight, Droplets, Home, Coins } from 'lucide-react';

const Navigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/trade', label: 'Trading', icon: ArrowLeftRight },
    { path: '/liquidity', label: 'Liquidity', icon: Droplets },
    { path: '/mint', label: 'Mint Tokens', icon: Coins },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-600 shadow-sm">
              <Store className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-gray-900">
              Centralized Token Exchange
            </span>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Wallet Connection */}
          <div className="flex items-center">
            <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700 !border-0 !rounded-md !px-4 !py-2 !text-sm !font-medium !shadow-sm !transition-colors !duration-200" />
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden pb-4 pt-2">
          <div className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`} />
                  <span>{item.label}</span>
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