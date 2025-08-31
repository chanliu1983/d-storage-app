import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { toast } from 'sonner';
import { ArrowUpDown, TrendingUp, Clock, Zap, Search, RefreshCw, ChevronDown, Info, AlertCircle } from 'lucide-react';
import { tokenRegistry, type TokenInfo as RegistryTokenInfo } from '../utils/tokenRegistry';
import BlockchainDataService from '../utils/blockchainDataService';

interface TokenInfo extends RegistryTokenInfo {
  price: number; // Price in SOL
  change24h: number;
  volume24h: number;
  liquidity: number;
}

interface SwapForm {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  slippage: number;
}

interface PoolInfo {
  exists: boolean;
  tokenReserve?: number;
  solReserve?: number;
  lpSupply?: number;
  feeRate?: number;
  loading: boolean;
  error?: string;
  tokenMint?: string;
  price?: number;
}

const TradingInterface: React.FC = () => {
  const { connection } = useConnection();
  const { connected, publicKey, wallet, sendTransaction, signTransaction, signAllTransactions } = useWallet();
  const blockchainDataService = useMemo(() => new BlockchainDataService(connection), [connection]);
  const [isSwapping, setIsSwapping] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<'idle' | 'preparing' | 'signing' | 'confirming' | 'confirmed' | 'failed'>('idle');
  const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [recentTrades, setRecentTrades] = useState<Array<{from: string, to: string, amount: number, tokensReceived?: number, timestamp: Date, signature?: string}>>([]);
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [poolInfo, setPoolInfo] = useState<PoolInfo>({ exists: false, loading: false });
  const [customTokenInput, setCustomTokenInput] = useState('');
  const [userTokenBalances, setUserTokenBalances] = useState<Array<{mint: string, balance: number, symbol?: string}>>([]);
  const [solBalance, setSolBalance] = useState<number>(0);
  
  const [isSolToToken, setIsSolToToken] = useState(true);
  
  const [form, setForm] = useState<SwapForm>({
    fromToken: 'SOL',
    toToken: '',
    fromAmount: 1,
    toAmount: 0,
    slippage: 5.0
  });

  // Load tokens from tokenRegistry
  useEffect(() => {
    const loadTokens = async () => {
      try {
        // Get popular tokens from registry
        const popularTokens = await tokenRegistry.getPopularTokens();
        
        // Add trading-specific data to each token
        const tokensWithTradingData: TokenInfo[] = popularTokens.map(token => ({
          ...token,
          price: getDefaultPrice(token.symbol), // Default prices
          change24h: (Math.random() - 0.5) * 10, // Random change for demo
          volume24h: Math.floor(Math.random() * 200000) + 50000, // Random volume
          liquidity: Math.floor(Math.random() * 500000) + 100000 // Random liquidity
        }));
        
        // Filter tokens to only show those with existing liquidity pools
        if (connected && wallet) {
          const walletInput = { adapter: wallet.adapter };
          const tokensWithPools = await blockchainDataService.getTokensWithPools(tokensWithTradingData, walletInput);
          // Convert the simplified tokens back to full TokenInfo objects
          const filteredTokens = tokensWithTradingData.filter(token => 
            tokensWithPools.some(poolToken => poolToken.mint === token.mint)
          );
          setAvailableTokens(filteredTokens);
        } else {
          // If no wallet connected, show all tokens (fallback behavior)
          setAvailableTokens(tokensWithTradingData);
        }
      } catch (error) {
        console.error('Error loading tokens:', error);
        // Fallback to empty array if loading fails
        setAvailableTokens([]);
      }
    };
    
    loadTokens();
  }, [connected, wallet, blockchainDataService]);

  // Load user token balances
  useEffect(() => {
    const loadUserBalances = async () => {
      if (!connected || !publicKey) {
         setUserTokenBalances([]);
         setSolBalance(0);
         return;
       }

       try {
          const userTokens = await blockchainDataService.getUserTokenBalances(publicKey, wallet || undefined);
        setUserTokenBalances(userTokens.filter(token => token.mint !== 'SOL'));
        const solToken = userTokens.find(token => token.mint === 'SOL');
        setSolBalance(solToken?.balance || 0);
      } catch (error) {
        console.error('Error loading user balances:', error);
        setUserTokenBalances([]);
        setSolBalance(0);
      }
    };

    loadUserBalances();
  }, [connected, wallet, blockchainDataService]);
  
  // Helper function to get default prices for demo
  const getDefaultPrice = (symbol: string): number => {
    const priceMap: { [key: string]: number } = {
      'USDC': 0.000045,
      'USDT': 0.000045,
      'SOL': 1.0,
      'WSOL': 1.0,
      'BONK': 0.00000002,
      'CUSTOM': 0.0001 // Default price for custom token
    };
    return priceMap[symbol] || 0.0001; // Default fallback price
  };

  const filteredTokens = availableTokens.filter(token =>
    token.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    token.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedToken = availableTokens.find(token => 
    token.mint === (isSolToToken ? form.toToken : form.fromToken)
  );

  // Get current token balance for max button
  const getCurrentTokenBalance = () => {
    if (isSolToToken) {
      return solBalance;
    } else {
      const tokenBalance = userTokenBalances.find(token => token.mint === form.fromToken);
      return tokenBalance?.balance || 0;
    }
  };

  // Handle max button click
   const handleMaxAmount = () => {
     const maxBalance = getCurrentTokenBalance();
     setForm(prev => ({
       ...prev,
       fromAmount: maxBalance
     }));
   };

  // Calculate output amount based on current price and direction
  useEffect(() => {
    if (selectedToken && form.fromAmount > 0) {
      const outputAmount = isSolToToken
        ? form.fromAmount / selectedToken.price // SOL -> Token
        : form.fromAmount * selectedToken.price; // Token -> SOL
      setForm(prev => ({ ...prev, toAmount: parseFloat(outputAmount.toFixed(6)) }));
    } else {
      setForm(prev => ({ ...prev, toAmount: 0 }));
    }
  }, [selectedToken, form.fromAmount, isSolToToken]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'fromAmount' || name === 'toAmount' || name === 'slippage' ? Number(value) : value
    }));
  };

  const refreshPrices = async () => {
    setPriceRefreshing(true);
    // Simulate price refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Add some random price fluctuation
    setAvailableTokens(prev => prev.map(token => ({
      ...token,
      price: token.price * (0.98 + Math.random() * 0.04), // ±2% fluctuation
      change24h: token.change24h + (Math.random() - 0.5) * 2
    })));
    
    setPriceRefreshing(false);
    toast.success('Prices refreshed');
  };

  const calculatePriceImpact = () => {
    if (!selectedToken || form.fromAmount === 0) return 0;
    // Simplified price impact calculation
    const impact = (form.fromAmount / selectedToken.liquidity) * 100;
    return Math.min(impact, 15); // Cap at 15%
  };

  const calculateMinReceived = () => {
    if (!poolInfo.tokenReserve || !poolInfo.solReserve || form.fromAmount <= 0) {
      // Fallback to simple calculation if pool data not available
      const slippageMultiplier = (100 - form.slippage) / 100;
      const safetyBuffer = 0.97; // Same 3% safety buffer as in executeSwap
      return (form.toAmount * slippageMultiplier * safetyBuffer).toFixed(6);
    }
    
    // Use AMM formula to calculate expected tokens
    const feeRate = poolInfo.feeRate || 0;
    const solAmountAfterFee = form.fromAmount * (10000 - feeRate) / 10000;
    
    // AMM constant product formula: token_out = (token_reserve * sol_amount_after_fee) / (sol_reserve + sol_amount_after_fee)
    const solAmountInLamports = solAmountAfterFee * 1e9;
    const tokenReserveRaw = poolInfo.tokenReserve * Math.pow(10, 6);
    const solReserveRaw = poolInfo.solReserve * 1e9;
    
    const tokenAmountOut = (tokenReserveRaw * solAmountInLamports) / (solReserveRaw + solAmountInLamports);
    const expectedTokens = tokenAmountOut / Math.pow(10, 6);
    
    // Apply slippage with safety buffer (same as executeSwap)
    const slippageMultiplier = (1 - form.slippage / 100);
    const safetyBuffer = 0.97; // Additional 3% safety buffer
    const minTokens = expectedTokens * slippageMultiplier * safetyBuffer;
    return minTokens.toFixed(6);
  };

  const executeSwap = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    const tokenMint = isSolToToken ? form.toToken : form.fromToken;
    if (!tokenMint || form.fromAmount <= 0) {
      toast.error('Please select a token and enter a valid amount');
      return;
    }

    const priceImpact = calculatePriceImpact();
    if (priceImpact > 10) {
      const confirmed = window.confirm(
        `High price impact detected (${priceImpact.toFixed(2)}%). Are you sure you want to continue?`
      );
      if (!confirmed) return;
    }

    setIsSwapping(true);
    setTransactionStatus('preparing');
    
    try {
      // Calculate minimum tokens to receive based on slippage and fee rate
      // First, account for the fee that will be deducted from SOL input
      const feeRate = poolInfo.feeRate || 0; // Default to 0 if no fee rate
      const solAmountAfterFee = form.fromAmount * (10000 - feeRate) / 10000;
      
      // Calculate expected tokens using AMM constant product formula
      // token_out = (token_reserve * sol_amount_after_fee) / (sol_reserve + sol_amount_after_fee)
      let expectedTokensAfterFee;
      if (poolInfo.tokenReserve && poolInfo.solReserve) {
        // Use AMM formula with actual pool reserves
        const solAmountInLamports = solAmountAfterFee * 1e9; // Convert SOL to lamports
        const tokenReserveRaw = poolInfo.tokenReserve * Math.pow(10, 6); // Convert to raw token units
        const solReserveRaw = poolInfo.solReserve * 1e9; // Convert to lamports
        
        const tokenAmountOut = (tokenReserveRaw * solAmountInLamports) / (solReserveRaw + solAmountInLamports);
        expectedTokensAfterFee = tokenAmountOut / Math.pow(10, 6); // Convert back to token units
      } else {
        // Fallback to simple price calculation if pool data not available
        expectedTokensAfterFee = selectedToken?.price ? solAmountAfterFee / selectedToken.price : form.toAmount;
      }
      
      // Apply slippage to the AMM-calculated expected amount with additional safety buffer
      const slippageMultiplier = (1 - form.slippage / 100);
      const safetyBuffer = 0.97; // Additional 3% safety buffer to prevent SlippageExceeded
      const minTokenAmount = expectedTokensAfterFee * slippageMultiplier * safetyBuffer;
      
      // Debug logging for price comparison
      console.log('=== Price Debug Information ===');
      console.log('1. selectedToken:', selectedToken);
      console.log('2. selectedToken.price:', selectedToken?.price);
      console.log('3. form.fromAmount:', form.fromAmount);
      console.log('4. form.toAmount (calculated):', form.toAmount);
      console.log('5. poolInfo.price (actual pool price):', poolInfo.price);
      console.log('6. poolInfo.feeRate:', feeRate);
      console.log('7. solAmountAfterFee:', solAmountAfterFee);
      console.log('8. expectedTokensAfterFee:', expectedTokensAfterFee);
      console.log('9. minTokenAmount (with slippage + safety buffer):', minTokenAmount);
      console.log('9a. slippageMultiplier:', slippageMultiplier);
      console.log('9b. safetyBuffer:', safetyBuffer);
      console.log('9c. minTokenAmount calculation: expectedTokensAfterFee * slippageMultiplier * safetyBuffer =', expectedTokensAfterFee, '*', slippageMultiplier, '*', safetyBuffer, '=', minTokenAmount);
      console.log('10. slippage:', form.slippage);
      
      if (selectedToken?.price && poolInfo.price) {
        const priceDifference = Math.abs(selectedToken.price - poolInfo.price);
        const priceDifferencePercent = (priceDifference / poolInfo.price) * 100;
        console.log('11. Price difference (absolute):', priceDifference);
        console.log('12. Price difference (%):', priceDifferencePercent.toFixed(2) + '%');
        console.log('13. Frontend expects tokens (simple price):', form.fromAmount / selectedToken.price);
        console.log('14. Frontend expects tokens (AMM formula):', expectedTokensAfterFee);
        console.log('15. Pool reserves - SOL:', poolInfo.solReserve, 'Token:', poolInfo.tokenReserve);
        console.log('16. AMM calculation details:', {
          solAmountAfterFee,
          tokenReserve: poolInfo.tokenReserve,
          solReserve: poolInfo.solReserve,
          expectedOutput: expectedTokensAfterFee
        });
      }
      console.log('==============================');
      
      // Log the exact parameters being sent to the contract
      console.log('=== CONTRACT PARAMETERS ===');
      console.log('tokenMint:', tokenMint);
      console.log('solAmount:', form.fromAmount);
      console.log('minTokenAmount (final):', minTokenAmount);
      console.log('minTokenAmount (raw units):', minTokenAmount * Math.pow(10, 6));
      console.log('publicKey:', publicKey?.toString());
      console.log('wallet connected:', !!wallet);
      console.log('===========================');
      
      // Compute Token -> SOL min amount if needed
      let minSolAmount = 0;
      if (!isSolToToken && poolInfo.exists && selectedToken && poolInfo.tokenReserve && poolInfo.solReserve) {
        const feeRate = poolInfo.feeRate ?? 30; // basis points
        const feeMultiplier = 1 - feeRate / 10000;
        const tokenAmountAfterFee = form.fromAmount * feeMultiplier;
        const expectedSolAfterFee = (tokenAmountAfterFee * poolInfo.solReserve) / (poolInfo.tokenReserve + tokenAmountAfterFee);
        const slippageMultiplier = 1 - (form.slippage / 100); // same convention as SOL->Token
        const safetyBuffer = 0.99;
        minSolAmount = expectedSolAfterFee * slippageMultiplier * safetyBuffer;
        console.log('Token->SOL calc:', { feeRate, tokenAmountAfterFee, expectedSolAfterFee, minSolAmount });
      }
      
      toast.info('Preparing transaction...');
      setTransactionStatus('signing');
      
      // Execute real blockchain swap (branch by direction)
      const walletParams = { ...(wallet ?? {}), sendTransaction, signTransaction, signAllTransactions, publicKey };
      const swapResult = isSolToToken
        ? await blockchainDataService.executeSwap(
            tokenMint,
            form.fromAmount,
            minTokenAmount,
            walletParams,
            publicKey as PublicKey
          )
        : await blockchainDataService.executeSwapTokenToSol(
            tokenMint,
            form.fromAmount,
            minSolAmount,
            walletParams,
            publicKey as PublicKey
          );
      
      if (swapResult.signature) {
        setTransactionStatus('confirming');
        toast.info('Transaction submitted, waiting for confirmation...');
      }
      
      if (swapResult.success) {
        // Get the token symbol for display
        const tokenSymbol = selectedToken?.symbol || 
          availableTokens.find(t => t.mint === tokenMint)?.symbol ||
          `TOKEN_${tokenMint.slice(0, 8)}`;
        
// Safely compute tokens received for trade history without assuming swapResult shape
        let tokensReceivedForTrade = form.toAmount;
        if (isSolToToken && 'tokensReceived' in swapResult && typeof (swapResult as { tokensReceived?: number }).tokensReceived === 'number') {
          tokensReceivedForTrade = (swapResult as { tokensReceived: number }).tokensReceived;
        }

        const newTrade = isSolToToken ? {
          from: 'SOL',
          to: tokenSymbol,
          amount: form.fromAmount,
          tokensReceived: tokensReceivedForTrade,
          timestamp: new Date(),
          signature: swapResult.signature
        } : {
          from: tokenSymbol,
          to: 'SOL',
          amount: form.fromAmount,
          tokensReceived: form.toAmount,
          timestamp: new Date(),
          signature: swapResult.signature
        };
        
        setTransactionStatus('confirmed');
        setRecentTrades(prev => [newTrade, ...prev.slice(0, 4)]); // Keep last 5 trades
        
        // Capture the swap direction before resetting state
        const wasSwappingSolToToken = isSolToToken;
        
        // Reset form
        setForm({
          fromToken: 'SOL',
          toToken: '',
          fromAmount: 1,
          toAmount: 0,
          slippage: 5.0
        });
        setIsSolToToken(true);
        
        if (wasSwappingSolToToken) {
          toast.success(
            `Successfully swapped ${newTrade.amount} SOL for ${(newTrade.tokensReceived ?? form.toAmount).toFixed(6)} ${tokenSymbol}!`
          );
        } else {
          toast.success(
            `Successfully swapped ${newTrade.amount} ${tokenSymbol} for ${newTrade.tokensReceived.toFixed(6)} SOL!`
          );
        }
        
        // Refresh user balances after successful swap
        if (publicKey) {
          setTimeout(async () => {
            try {
              await blockchainDataService.getUserTokenBalances(publicKey, wallet ?? undefined);
              console.log('User balances refreshed after successful swap');
            } catch (error) {
              console.error('Error refreshing user balances:', error);
            }
          }, 1000);
        }
      } else {
        throw new Error(swapResult.error || 'Swap failed');
      }
      
    } catch (error) {
      console.error('Error executing swap:', error);
      setTransactionStatus('failed');
      
      const errorMessage = error instanceof Error ? error.message : 'Please try again.';
      
      // Check if this is a liquidity pool error
      if (errorMessage.includes('No liquidity pool exists for this token')) {
        toast.error(
          <div className="flex flex-col space-y-2">
            <span>No liquidity pool exists for this token</span>
            <button
              onClick={() => window.location.href = '/liquidity'}
              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
            >
              Create Liquidity Pool
            </button>
          </div>,
          { duration: 6000 }
        );
      } else {
        toast.error(`Swap failed: ${errorMessage}`);
      }
    } finally {
      setIsSwapping(false);
      // Reset transaction status after a delay to show the final state
      setTimeout(() => {
        setTransactionStatus('idle');
      }, 2000);
    }
  };

  const handleSwapDirection = () => {
    setIsSolToToken(prev => {
      const newDirection = !prev;
      
      if (newDirection) {
        // Switching to SOL -> Token
        setForm(prevForm => {
          // Preserve the current token selection when switching directions
          const targetToken = prevForm.fromToken !== 'SOL' ? prevForm.fromToken : prevForm.toToken;
          // Only use valid token addresses, clear pool info if no valid token
          const validToken = targetToken && targetToken.trim() !== '' ? targetToken : '';
          
          // Clear pool info if no valid token is selected
          if (!validToken) {
            setPoolInfo({
              exists: false,
              loading: false,
              error: null,
              tokenReserve: null,
              solReserve: null,
              lpSupply: null,
              feeRate: null,
              price: null
            });
          }
          
          return {
            fromToken: 'SOL',
            toToken: validToken,
            fromAmount: 0,
            toAmount: 0,
            slippage: prevForm.slippage
          };
        });
      } else {
        // Switching to Token -> SOL
        setForm(prevForm => {
          // Preserve the current token selection when switching directions
          const targetToken = prevForm.toToken !== 'SOL' ? prevForm.toToken : prevForm.fromToken;
          // Only use valid token addresses, clear pool info if no valid token
          const validToken = targetToken && targetToken.trim() !== '' ? targetToken : '';
          
          // Clear pool info if no valid token is selected
          if (!validToken) {
            setPoolInfo({
              exists: false,
              loading: false,
              error: null,
              tokenReserve: null,
              solReserve: null,
              lpSupply: null,
              feeRate: null,
              price: null
            });
          }
          
          return {
            fromToken: validToken,
            toToken: 'SOL',
            fromAmount: 0,
            toAmount: 0,
            slippage: prevForm.slippage
          };
        });
      }
      
      return newDirection;
    });
    
    toast.info('Swapped direction');
  };

  // Function to check liquidity pool for a specific token
  const checkLiquidityPool = useCallback(async (tokenMint: string, autoSelect: boolean = false) => {
    if (!tokenMint || !connected || !wallet) {
      setPoolInfo({ exists: false, loading: false });
      return;
    }

    setPoolInfo({ exists: false, loading: true });

    try {
      // Validate the token mint address
      let tokenMintPubkey: PublicKey;
      try {
        tokenMintPubkey = new PublicKey(tokenMint);
      } catch {
        setPoolInfo({ 
          exists: false, 
          loading: false, 
          error: 'Invalid token mint address format' 
        });
        return;
      }

      // Check if pool exists
      const walletInput = wallet ? { adapter: wallet.adapter } : undefined;
      const hasPool = await blockchainDataService.hasLiquidityPool(tokenMint, walletInput);
      
      if (hasPool) {
        // Get detailed pool data
        const program = blockchainDataService['initializeProgram'](walletInput);
        const poolData = await blockchainDataService['getPoolData'](program, tokenMintPubkey);
        
        if (poolData) {
          const tokenReserve = poolData.tokenReserve.toNumber() / Math.pow(10, 6); // Assuming 6 decimals
          const solReserve = poolData.solReserve.toNumber() / 1e9; // Convert lamports to SOL
          const lpSupply = poolData.lpSupply.toNumber() / Math.pow(10, 6);
          const calculatedPrice = solReserve / tokenReserve; // Calculate price from reserves
          
          setPoolInfo({
            exists: true,
            loading: false,
            tokenReserve,
            solReserve,
            lpSupply,
            feeRate: poolData.feeRate,
            tokenMint,
            price: calculatedPrice
          });

          // Auto-select the token for swapping if requested
          if (autoSelect) {
            // Create a custom token object for the dropdown
            const customToken: TokenInfo = {
              mint: tokenMint,
              symbol: `CUSTOM_${tokenMint.slice(0, 8)}`,
              name: `Custom Token (${tokenMint.slice(0, 8)}...)`,
              decimals: 6,
              price: calculatedPrice,
              change24h: 0,
              volume24h: 0,
              liquidity: solReserve * 2 // Rough estimate
            };

            // Add to available tokens if not already present
            setAvailableTokens(prev => {
              const exists = prev.find(token => token.mint === tokenMint);
              if (!exists) {
                return [customToken, ...prev];
              }
              return prev.map(token => 
                token.mint === tokenMint 
                  ? { ...token, price: calculatedPrice }
                  : token
              );
            });

            // Set as selected token
            setForm(prev => ({ ...prev, toToken: tokenMint }));
            setShowTokenDropdown(false);
            toast.success('Custom token selected for swapping!');
          }
        } else {
          setPoolInfo({ 
            exists: false, 
            loading: false, 
            error: 'Pool data could not be retrieved' 
          });
        }
      } else {
        setPoolInfo({ 
          exists: false, 
          loading: false, 
          error: 'No liquidity pool found for this token' 
        });
      }
    } catch (error) {
      console.error('Error checking liquidity pool:', error);
      setPoolInfo({ 
        exists: false, 
        loading: false, 
        error: 'Error checking liquidity pool: ' + (error as Error).message 
      });
    }
  }, [connected, wallet, blockchainDataService]);

  // Check pool when token selection changes
  useEffect(() => {
    if (form.toToken && form.toToken.trim() !== '' && form.toToken !== 'SOL') {
      checkLiquidityPool(form.toToken);
    } else {
      setPoolInfo({ exists: false, loading: false });
    }
  }, [form.toToken, checkLiquidityPool]);

  // Refresh pool data when trading direction changes
  useEffect(() => {
    if (form.toToken && form.toToken.trim() !== '' && form.toToken !== 'SOL') {
      checkLiquidityPool(form.toToken);
    }
  }, [isSolToToken, checkLiquidityPool, form.toToken]);

  // Handle custom token input
  const handleCustomTokenCheck = () => {
    if (customTokenInput.trim()) {
      checkLiquidityPool(customTokenInput.trim());
    }
  };

  // Handle using custom token for swap
  const handleUseCustomTokenForSwap = () => {
    if (customTokenInput.trim() && poolInfo.exists) {
      checkLiquidityPool(customTokenInput.trim(), true);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header Section */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">
              Trading Interface
            </h1>
            <p className="text-gray-600 text-lg">
              Swap SOL for any available token with real-time pricing.
            </p>
          </div>
          <button
            onClick={refreshPrices}
            disabled={priceRefreshing}
            className="flex items-center space-x-3 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all duration-300 shadow-sm"
          >
            <RefreshCw className={`h-5 w-5 ${priceRefreshing ? 'animate-spin' : ''}`} />
            <span className="font-semibold">Refresh Prices</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Swap Interface */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-gray-50 p-8 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                <ArrowUpDown className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900">
                Swap Tokens
              </h2>
            </div>
          </div>

          <div className="p-8">

            <div className="space-y-8">
              {/* From Token */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <label className="block text-sm font-semibold text-gray-900 mb-4">
                  From {isSolToToken ? '(SOL)' : '(Token)'}
                </label>
                <div className="flex items-center space-x-4">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      name="fromAmount"
                      value={form.fromAmount}
                      onChange={handleInputChange}
                      min="0"
                      step="0.000001"
                      className="w-full px-4 py-4 pr-16 text-xl bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
                      placeholder="0.0"
                    />
                    <button
                      onClick={handleMaxAmount}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all duration-200 shadow-sm"
                    >
                      MAX
                    </button>
                  </div>
                  {!isSolToToken ? (
                    <div className="relative">
                      <button
                         onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                         className="flex items-center space-x-3 bg-white border border-gray-300 px-4 py-4 rounded-lg hover:bg-gray-50 transition-all duration-300"
                       >
                         {form.fromToken && form.fromToken !== 'SOL' ? (
                           <>
                             <div className="w-8 h-8 bg-green-500 rounded-full shadow-sm"></div>
                             <div className="flex flex-col">
                               <span className="font-bold text-gray-900 text-sm">
                                 {selectedToken?.symbol || `CUSTOM`}
                               </span>
                               {!selectedToken?.symbol && (
                                 <span className="text-gray-600 text-xs">
                                   {form.fromToken.slice(0, 8)}...
                                 </span>
                               )}
                             </div>
                           </>
                         ) : (
                           <span className="text-gray-600 font-medium">Select Token</span>
                         )}
                         <ChevronDown className="h-5 w-5 text-gray-600" />
                       </button>

                       {/* Token Dropdown */}
                       {showTokenDropdown && (
                         <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                           <div className="p-4">
                             <div className="relative mb-4">
                               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                               <input
                                 type="text"
                                 placeholder="Search tokens..."
                                 value={searchTerm}
                                 onChange={(e) => setSearchTerm(e.target.value)}
                                 className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                               />
                             </div>
                             <div className="space-y-2">
                               {filteredTokens.map((token) => (
                                 <button
                                   key={token.mint}
                                   onClick={() => {
                                     setForm(prev => ({ ...prev, fromToken: token.mint, fromAmount: 0, toAmount: 0 }));
                                     setShowTokenDropdown(false);
                                   }}
                                   className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-all duration-200 text-left"
                                 >
                                   <div className="flex items-center space-x-3">
                                     <div className="w-8 h-8 bg-green-500 rounded-full"></div>
                                     <div>
                                       <p className="font-bold text-gray-900">{token.symbol}</p>
                                       <p className="text-sm text-gray-600">{token.name}</p>
                                     </div>
                                   </div>
                                   <div className="text-right">
                                     <p className="font-medium text-gray-900">{token.price.toFixed(8)} SOL</p>
                                     <p className={`text-xs ${
                                       token.change24h >= 0 ? 'text-green-300' : 'text-red-300'
                                     }`}>
                                       {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                                     </p>
                                   </div>
                                 </button>
                               ))}
                             </div>
                           </div>
                         </div>
                       )}
                     </div>
                  ) : (
                    <div className="flex items-center space-x-3 bg-white border border-gray-300 px-4 py-4 rounded-lg">
                      <div className="w-8 h-8 bg-yellow-500 rounded-full shadow-sm"></div>
                      <span className="font-bold text-gray-900 text-lg">SOL</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Swap Direction Indicator */}
              <div className="flex justify-center">
                <button
                  onClick={handleSwapDirection}
                  className="p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 shadow-sm border border-gray-200"
                >
                  <ArrowUpDown className="h-5 w-5" />
                </button>
              </div>

              {/* To Token */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <label className="block text-sm font-semibold text-gray-900 mb-4">
                  To {isSolToToken ? '(Token)' : '(SOL)'}
                </label>
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <input
                      type="number"
                      name="toAmount"
                      value={form.toAmount}
                      onChange={handleInputChange}
                      min="0"
                      step="0.000001"
                      className="w-full px-4 py-4 text-xl bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
                      placeholder="0.0"
                      readOnly
                    />
                  </div>
                  {!isSolToToken ? (
                    <div className="flex items-center space-x-3 bg-white border border-gray-300 px-4 py-4 rounded-lg">
                      <div className="w-8 h-8 bg-yellow-500 rounded-full shadow-sm"></div>
                      <span className="font-bold text-gray-900 text-lg">SOL</span>
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                         onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                         className="flex items-center space-x-3 bg-white border border-gray-300 px-4 py-4 rounded-lg hover:bg-gray-50 transition-all duration-300"
                       >
                         {form.toToken ? (
                           <>
                             <div className="w-8 h-8 bg-green-500 rounded-full shadow-sm"></div>
                             <div className="flex flex-col">
                               <span className="font-bold text-gray-900 text-sm">
                                 {selectedToken?.symbol || `CUSTOM`}
                               </span>
                               {!selectedToken?.symbol && (
                                 <span className="text-gray-600 text-xs">
                                   {form.toToken.slice(0, 8)}...
                                 </span>
                               )}
                             </div>
                           </>
                         ) : (
                           <span className="text-gray-600 font-medium">Select Token</span>
                         )}
                         <ChevronDown className="h-5 w-5 text-gray-600" />
                       </button>

                       {/* Token Dropdown */}
                       {showTokenDropdown && (
                         <div className="absolute top-full left-0 right-0 mt-2 backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl z-50 max-h-64 overflow-y-auto">
                           <div className="p-4">
                             <div className="relative mb-4">
                               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                               <input
                                 type="text"
                                 placeholder="Search tokens..."
                                 value={searchTerm}
                                 onChange={(e) => setSearchTerm(e.target.value)}
                                 className="w-full pl-10 pr-3 py-2 bg-white/10 border border-white/30 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                               />
                             </div>
                             <div className="space-y-2">
                               {filteredTokens.map((token) => (
                                 <button
                                   key={token.mint}
                                   onClick={() => {
                                     setForm(prev => ({ ...prev, toToken: token.mint, fromAmount: 0, toAmount: 0 }));
                                     setShowTokenDropdown(false);
                                   }}
                                   className="w-full flex items-center justify-between p-3 hover:bg-white/10 rounded-xl transition-all duration-200 text-left"
                                 >
                                   <div className="flex items-center space-x-3">
                                     <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-full"></div>
                                     <div>
                                       <p className="font-bold text-white">{token.symbol}</p>
                                       <p className="text-sm text-white/60">{token.name}</p>
                                     </div>
                                   </div>
                                   <div className="text-right">
                                     <p className="font-medium text-white">{token.price.toFixed(8)} SOL</p>
                                     <p className={`text-xs ${
                                       token.change24h >= 0 ? 'text-green-300' : 'text-red-300'
                                     }`}>
                                       {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                                     </p>
                                   </div>
                                 </button>
                               ))}
                             </div>
                           </div>
                         </div>
                       )}
                     </div>
                  )}
                </div>
              </div>

              {/* Slippage Settings */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <label className="block text-sm font-semibold text-gray-900 mb-4">
                  Slippage Tolerance (%)
                </label>
                <div className="flex items-center space-x-6">
                  <input
                    type="range"
                    name="slippage"
                    value={form.slippage}
                    onChange={handleInputChange}
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-lg font-bold text-gray-900 bg-white border border-gray-300 px-4 py-2 rounded-lg min-w-[4rem] text-center">
                    {form.slippage}%
                  </span>
                </div>
              </div>

              {/* Custom Token Input Section */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Search className="h-5 w-5" />
                  <span>Check Custom Token Pool</span>
                </h3>
                <div className="space-y-4">
                  <div className="flex space-x-3">
                    <input
                      type="text"
                      value={customTokenInput}
                      onChange={(e) => setCustomTokenInput(e.target.value)}
                      placeholder="Enter token mint address (e.g., H8w8FMaZQu2DFPxMbouAyh7tMG5br7WC7gTz1EWJ54ZW)"
                      className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
                    />
                    <button
                      onClick={handleCustomTokenCheck}
                      disabled={!customTokenInput.trim() || poolInfo.loading}
                      className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-semibold shadow-sm"
                    >
                      {poolInfo.loading ? 'Checking...' : 'Check Pool'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Liquidity Pool Information */}
              {(poolInfo.loading || poolInfo.exists || poolInfo.error) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                    <Info className="h-5 w-5" />
                    <span>Liquidity Pool Information</span>
                  </h3>
                  
                  {poolInfo.loading && (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      <span className="ml-3 text-gray-600">Checking liquidity pool...</span>
                    </div>
                  )}
                  
                  {poolInfo.exists && !poolInfo.loading && (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2 mb-4">
                        <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                        <span className="text-green-600 font-semibold">Liquidity Pool Found</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-gray-600 font-medium">Token Reserve:</span>
                          <span className="font-bold text-gray-900">
                            {poolInfo.tokenReserve?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '0'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-gray-600 font-medium">SOL Reserve:</span>
                          <span className="font-bold text-gray-900">
                            {poolInfo.solReserve?.toLocaleString(undefined, { maximumFractionDigits: 4 }) || '0'} SOL
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-gray-600 font-medium">LP Supply:</span>
                          <span className="font-bold text-gray-900">
                            {poolInfo.lpSupply?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || '0'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-gray-600 font-medium">Fee Rate:</span>
                          <span className="font-bold text-gray-900">
                            {poolInfo.feeRate ? (poolInfo.feeRate / 100).toFixed(2) : '0'}%
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-green-700 text-sm mb-3">
                          ✓ This token can be swapped. Pool has sufficient liquidity.
                        </p>
                        <button
                          onClick={handleUseCustomTokenForSwap}
                          className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all duration-300 font-semibold text-sm flex items-center justify-center space-x-2 shadow-sm"
                        >
                          <ArrowUpDown className="h-4 w-4" />
                          <span>Use This Token for Swap</span>
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {poolInfo.error && !poolInfo.loading && (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2 mb-4">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <span className="text-red-600 font-semibold">Pool Check Result</span>
                      </div>
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-700 text-sm mb-3">
                          ⚠️ {poolInfo.error}
                        </p>
                        <p className="text-red-600 text-xs mb-4">
                          This token cannot be swapped because no liquidity pool exists. You need to create a liquidity pool first before you can trade this token.
                        </p>
                        <button
                          onClick={() => window.location.href = '/liquidity'}
                          className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-300 font-semibold text-sm flex items-center justify-center space-x-2 shadow-sm"
                        >
                          <TrendingUp className="h-4 w-4" />
                          <span>Create Liquidity Pool</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Swap Details */}
              {selectedToken && form.fromAmount > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Swap Details</span>
                  </h3>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600 font-medium">Price:</span>
                      <span className="font-bold text-gray-900">
                        1 {selectedToken.symbol} = {selectedToken.price.toFixed(8)} SOL
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600 font-medium">Price Impact:</span>
                      <span className={`font-bold px-3 py-1 rounded-lg ${
                        calculatePriceImpact() > 5 
                          ? 'text-red-700 bg-red-50 border border-red-200' 
                          : 'text-green-700 bg-green-50 border border-green-200'
                      }`}>
                        {calculatePriceImpact().toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-200">
                      <span className="text-gray-600 font-medium">Minimum Received:</span>
                      <span className="font-bold text-gray-900">
                        {calculateMinReceived()} {selectedToken.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-600 font-medium">Liquidity:</span>
                      <span className="font-bold text-gray-900">
                        {selectedToken.liquidity.toLocaleString()} SOL
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Swap Button */}
              <button
                onClick={executeSwap}
                disabled={isSwapping || !publicKey || !form.toToken || form.fromAmount <= 0}
                className="w-full bg-blue-600 text-white py-6 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3 text-xl font-bold shadow-lg hover:shadow-xl transition-all duration-300"
              >
                {transactionStatus === 'preparing' && (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    <span>Preparing...</span>
                  </>
                )}
                {transactionStatus === 'signing' && (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    <span>Sign Transaction</span>
                  </>
                )}
                {transactionStatus === 'confirming' && (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    <span>Confirming...</span>
                  </>
                )}
                {transactionStatus === 'confirmed' && (
                  <>
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm">✓</span>
                    </div>
                    <span>Success!</span>
                  </>
                )}
                {transactionStatus === 'failed' && (
                  <>
                    <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm">✗</span>
                    </div>
                    <span>Failed</span>
                  </>
                )}
                {transactionStatus === 'idle' && (
                  <>
                    <Zap className="h-6 w-6" />
                    <span>Swap Tokens</span>
                  </>
                )}
              </button>
          </div>
          </div>
        </div>

        {/* Market Info & Recent Trades */}
        <div className="space-y-8">
          {/* Token Market Info */}
          {selectedToken && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-8">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center shadow-md">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">
                  {selectedToken.symbol} Market
                </h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">Price:</span>
                  <span className="font-bold text-gray-900 text-lg">
                    {selectedToken.price.toFixed(8)} SOL
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">24h Change:</span>
                  <span className={`font-bold text-lg px-3 py-1 rounded-lg ${
                    selectedToken.change24h >= 0 
                      ? 'text-green-700 bg-green-50 border border-green-200' 
                      : 'text-red-700 bg-red-50 border border-red-200'
                  }`}>
                    {selectedToken.change24h >= 0 ? '+' : ''}{selectedToken.change24h.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">24h Volume:</span>
                  <span className="font-bold text-gray-900 text-lg">
                    {selectedToken.volume24h.toLocaleString()} SOL
                  </span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-600 font-medium">Liquidity:</span>
                  <span className="font-bold text-gray-900 text-lg">
                    {selectedToken.liquidity.toLocaleString()} SOL
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Trades */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center shadow-md">
                <Clock className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">
                Recent Trades
              </h3>
            </div>
            {recentTrades.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-600 text-lg font-medium">
                  No recent trades. Make your first swap!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentTrades.map((trade, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-4 px-6 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-all duration-300"
                  >
                    <div>
                      <p className="text-lg font-bold text-gray-900 mb-1">
                        {trade.amount} {trade.from} → {trade.tokensReceived ? trade.tokensReceived.toFixed(6) : 'N/A'} {trade.to}
                      </p>
                      <p className="text-sm text-gray-600">
                        {trade.timestamp.toLocaleTimeString()}
                        {trade.signature && (
                          <span className="ml-2 text-blue-600">
                            • Tx: {trade.signature.slice(0, 8)}...
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="bg-green-50 border border-green-200 text-green-700 text-sm font-bold px-4 py-2 rounded-lg">
                      Success
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingInterface;