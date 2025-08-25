import { PublicKey } from "@solana/web3.js";
import { Connection } from "@solana/web3.js";
import type { ParsedAccountData } from "@solana/web3.js";

interface SolanaTokenListEntry {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags?: string[];
  chainId: number;
}

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUri?: string;
  tags?: string[];
  verified?: boolean;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  logoUri?: string;
}

class TokenRegistry {
  private tokenCache = new Map<string, TokenInfo>();
  private tokenListCache: TokenInfo[] | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly SOLANA_TOKEN_LIST_URL =
    "https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json";

  async getPopularTokens(): Promise<TokenInfo[]> {
    const now = Date.now();

    // Return cached data if still valid
    if (this.tokenListCache && now - this.lastFetchTime < this.CACHE_DURATION) {
      return this.tokenListCache;
    }

    try {
      const response = await fetch(this.SOLANA_TOKEN_LIST_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch token list: ${response.statusText}`);
      }

      const data = await response.json();
      const tokens: TokenInfo[] = data.tokens
        .filter((token: SolanaTokenListEntry) => {
          // Filter for mainnet tokens with good metadata
          return (
            token.chainId === 101 && // Mainnet
            token.name &&
            token.symbol &&
            token.logoURI &&
            !token.tags?.includes("unknown")
          );
        })
        .map((token: SolanaTokenListEntry) => ({
          mint: token.address,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          logoUri: token.logoURI,
          tags: token.tags || [],
          verified: true,
        }))
        .slice(0, 50); // Limit to top 50 popular tokens

      // Cache the results
      this.tokenListCache = tokens;
      this.lastFetchTime = now;

      // Also cache individual tokens
      tokens.forEach((token) => {
        this.tokenCache.set(token.mint, token);
      });

      return tokens;
    } catch (error) {
      console.error("Error fetching token list:", error);

      // Return fallback popular tokens if fetch fails
      return this.getFallbackTokens();
    }
  }

  async getTokenMetadata(
    connection: Connection,
    mintAddress: string
  ): Promise<TokenInfo | null> {
    // Check cache first
    if (this.tokenCache.has(mintAddress)) {
      return this.tokenCache.get(mintAddress)!;
    }

    try {
      const mintPubkey = new PublicKey(mintAddress);

      // Try to get token metadata from the mint account
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);

      if (
        !mintInfo.value ||
        !mintInfo.value.data ||
        typeof mintInfo.value.data === "string"
      ) {
        return null;
      }

      const parsedData = mintInfo.value.data as ParsedAccountData;
      if (
        parsedData.program !== "spl-token" ||
        !("parsed" in parsedData) ||
        !parsedData.parsed
      ) {
        return null;
      }

      const { decimals } = parsedData.parsed.info as { decimals: number };

      // Try to fetch from token list first
      const popularTokens = await this.getPopularTokens();
      const knownToken = popularTokens.find(
        (token) => token.mint === mintAddress
      );

      if (knownToken) {
        this.tokenCache.set(mintAddress, knownToken);
        return knownToken;
      }

      // If not in token list, create basic token info
      const tokenInfo: TokenInfo = {
        mint: mintAddress,
        name: `Token ${mintAddress.slice(0, 8)}...`,
        symbol: "UNKNOWN",
        decimals: decimals,
        verified: false,
      };

      // Try to get metadata from Metaplex (simplified)
      try {
        const metadataInfo = await this.getMetaplexMetadata(
          connection,
          mintPubkey
        );
        if (metadataInfo) {
          tokenInfo.name = metadataInfo.name || tokenInfo.name;
          tokenInfo.symbol = metadataInfo.symbol || tokenInfo.symbol;
          tokenInfo.logoUri = metadataInfo.logoUri;
        }
      } catch (error) {
        console.warn("Could not fetch Metaplex metadata:", error);
      }

      this.tokenCache.set(mintAddress, tokenInfo);
      return tokenInfo;
    } catch (error) {
      console.error("Error getting token metadata:", error);
      return null;
    }
  }

  private async getMetaplexMetadata(
    connection: Connection,
    mintPubkey: PublicKey
  ): Promise<TokenMetadata | null> {
    try {
      // This is a simplified version - in a real app you'd use @metaplex-foundation/js
      const METADATA_PROGRAM_ID = new PublicKey(
        "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
      );

      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mintPubkey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      const metadataAccount = await connection.getAccountInfo(metadataPDA);

      if (!metadataAccount || !metadataAccount.data) {
        return null;
      }

      // This is a very basic parser - you'd want to use proper Metaplex tools
      // For now, we'll just return null and rely on the token list
      return null;
    } catch {
      return null;
    }
  }

  searchTokens(query: string, tokens: TokenInfo[]): TokenInfo[] {
    if (!query.trim()) {
      return tokens;
    }

    const searchTerm = query.toLowerCase();
    return tokens.filter(
      (token) =>
        token.name.toLowerCase().includes(searchTerm) ||
        token.symbol.toLowerCase().includes(searchTerm) ||
        token.mint.toLowerCase().includes(searchTerm)
    );
  }

  validateMintAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  getValidationError(address: string): string | null {
    if (!address || address.trim().length === 0) {
      return "Token mint address is required";
    }

    if (address.length < 32 || address.length > 44) {
      return "Token mint address must be between 32-44 characters";
    }

    if (!/^[A-Za-z0-9]+$/.test(address)) {
      return "Token mint address can only contain alphanumeric characters";
    }

    try {
      new PublicKey(address);
      return null; // Valid address
    } catch {
      return "Invalid token mint address format";
    }
  }

  getFallbackTokens(): TokenInfo[] {
    return [
      {
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        logoUri:
          "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
        verified: true,
      },
      {
        mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        logoUri:
          "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
        verified: true,
      },
      {
        mint: "So11111111111111111111111111111111111111112",
        name: "Wrapped SOL",
        symbol: "SOL",
        decimals: 9,
        logoUri:
          "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
        verified: true,
      },
      {
        mint: "56aSpoP6M8ho68bZR3TNjXR81Asi2fspCneKkXTWdKMA",
        name: "Test Token",
        symbol: "TEST",
        decimals: 9,
        verified: false,
      },
    ];
  }

  clearCache(): void {
    this.tokenCache.clear();
    this.tokenListCache = null;
    this.lastFetchTime = 0;
  }
}

export const tokenRegistry = new TokenRegistry();
export default tokenRegistry;
