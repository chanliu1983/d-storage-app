import { useState, useEffect, useMemo } from 'react';
import type { FC } from 'react';
import { useConnection, useAnchorWallet, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, web3, type Idl } from '@coral-xyz/anchor';
import type { DStorageApp } from '../target/types/d_storage_app';
import idlJson from '../target/idl/d_storage_app.json';

const PROGRAM_ID = new PublicKey('Ed5i4GsQCTU5NLvgieHUWHFAGfBJ61NfktWw271fesEJ');

// Use the IDL directly from the file
const idl = idlJson as unknown as Idl;

const KeyValueStore: FC = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { connected, connecting } = useWallet();
  const [storeAccount, setStoreAccount] = useState<Keypair | null>(null);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [allPairs, setAllPairs] = useState<{ key: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const publicKey = wallet?.publicKey || null;

  // Add a loading state for wallet initialization
  const [isWalletInitializing, setIsWalletInitializing] = useState(true);

  useEffect(() => {
    if (wallet) {
      console.log('Wallet initialized:', wallet.publicKey.toString());
      setIsWalletInitializing(false);
    }
  }, [wallet]);

  const provider = useMemo(() => {
    console.log('Provider initialization - Debug info:', {
      hasWallet: !!wallet,
      hasConnection: !!connection,
      isConnected: connected,
      isConnecting: connecting,
      isWalletInitializing,
      walletPublicKey: wallet?.publicKey?.toString(),
      connectionEndpoint: connection?.rpcEndpoint,
      walletType: wallet ? typeof wallet : 'undefined',
      connectionType: connection ? typeof connection : 'undefined'
    });

    // First check if we have a connection
    if (!connection) {
      console.log('No connection available yet');
      return null;
    }

    // Then check if we have a wallet
    if (!wallet) {
      console.log('No wallet available yet');
      return null;
    }

    // Finally check if the wallet is properly initialized
    if (!wallet.publicKey) {
      console.log('Wallet not fully initialized yet');
      return null;
    }

    console.log('Creating provider with wallet:', wallet.publicKey.toString());
    const provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed', preflightCommitment: 'confirmed' }
    );
    console.log('Provider created successfully:', {
      providerPublicKey: provider.publicKey.toString(),
      connection: provider.connection.rpcEndpoint
    });
    return provider;
  }, [connection, wallet, connected, connecting, isWalletInitializing]);

  // Add a debug effect to monitor wallet and connection
  useEffect(() => {
    console.log('Wallet/Connection state changed:', {
      hasWallet: !!wallet,
      hasConnection: !!connection,
      isConnected: connected,
      isConnecting: connecting,
      isWalletInitializing,
      walletPublicKey: wallet?.publicKey?.toString(),
      connectionEndpoint: connection?.rpcEndpoint,
      walletType: wallet ? typeof wallet : 'undefined',
      connectionType: connection ? typeof connection : 'undefined'
    });
  }, [wallet, connection, connected, connecting, isWalletInitializing]);

  // Add a separate effect to handle wallet connection
  useEffect(() => {
    if (connected && wallet && connection && !isWalletInitializing) {
      console.log('Wallet fully connected and ready:', {
        publicKey: wallet.publicKey.toString(),
        connection: connection.rpcEndpoint
      });
    }
  }, [connected, wallet, connection, isWalletInitializing]);

  const program = useMemo(() => {
    if (!provider) {
      console.log('No provider available');
      return null;
    }
    try {
      console.log('Creating program instance...');
      console.log('IDL:', idl);
      console.log('Program ID:', PROGRAM_ID.toString());
      console.log('Provider:', provider.publicKey.toString());

      const program = new Program(
        idl,
        provider
      ) as unknown as Program<DStorageApp>;

      console.log('Program created successfully');
      return program;
    } catch (error) {
      console.error('Error creating program:', error);
      return null;
    }
  }, [provider]);

  // Add a debug effect to monitor program initialization
  useEffect(() => {
    if (program) {
      console.log('Program initialized successfully:', {
        programId: program.programId.toString(),
        provider: provider?.publicKey.toString()
      });
    } else {
      console.log('Program not initialized');
    }
  }, [program, provider]);

  useEffect(() => {
    if (publicKey) {
      console.log('Wallet connected:', publicKey.toString());
      // Generate a new store account when wallet connects
      const newStoreAccount = Keypair.generate();
      console.log('Generated store account:', newStoreAccount.publicKey.toString());
      setStoreAccount(newStoreAccount);
    }
  }, [publicKey]);

  const initializeStore = async () => {
    if (!program || !publicKey) {
      console.error('Missing required data:', { publicKey, storeAccount, program });
      setStatus('Error: Program or wallet not initialized');
      return;
    }

    try {
      setLoading(true);
      setStatus('Initializing store...');

      const newStoreAccount = Keypair.generate();
      setStoreAccount(newStoreAccount);

      console.log('Initializing store with accounts:', {
        store: newStoreAccount.publicKey.toString(),
        signer: publicKey.toString(),
        systemProgram: SystemProgram.programId.toString()
      });

      const tx = await program.methods
        .initialize()
        .accounts({
          store: newStoreAccount.publicKey,
          signer: publicKey,
          systemProgram: SystemProgram.programId
        })
        .signers([newStoreAccount])
        .rpc();

      console.log('Store initialized successfully:', tx);
      setStatus('Store initialized successfully!');
    } catch (error) {
      console.error('Error initializing store:', error);
      setStatus('Error initializing store');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!wallet || !program) {
      setStatus('Please connect your wallet first');
      return;
    }

    if (!key || !value) {
      setStatus('Please enter both key and value');
      return;
    }

    try {
      setLoading(true);
      setStatus('Saving value...');

      // Use existing store account or create a new one
      let currentStoreAccount = storeAccount;
      if (!currentStoreAccount) {
        currentStoreAccount = Keypair.generate();
        setStoreAccount(currentStoreAccount);

        // Initialize the store
        try {
          const initTx = await program.methods
            .initialize()
            .accounts({
              store: currentStoreAccount.publicKey,
              signer: wallet.publicKey
            })
            .signers([currentStoreAccount])
            .rpc();
          console.log('Store initialized:', initTx);
        } catch (e) {
          console.error('Error initializing store:', e);
          setStatus('Error initializing store');
          return;
        }
      }

      // Now save the value
      const saveTx = await program.methods
        .save(key, value)
        .accounts({
          store: currentStoreAccount.publicKey,
          signer: wallet.publicKey
        })
        .rpc();

      console.log('Transaction successful:', saveTx);
      setStatus('Value saved successfully!');
      setKey('');
      setValue('');
    } catch (error) {
      console.error('Error saving value:', error);
      setStatus('Error saving value: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const queryKey = async () => {
    if (!publicKey || !storeAccount || !program) return;

    try {
      setLoading(true);
      const tx = await program.methods.query(key).accounts({
        store: storeAccount.publicKey,
      }).rpc();

      const result = await connection.getTransaction(tx, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (result?.meta?.logMessages) {
        const logMessage = result.meta.logMessages.find(log => 
          log.includes('Query result:')
        );
        if (logMessage) {
          setQueryResult(logMessage.split('Query result: ')[1]);
        }
      }
    } catch (error) {
      console.error('Error querying key:', error);
    } finally {
      setLoading(false);
    }
  };

  const listAll = async () => {
    if (!publicKey || !storeAccount || !program) {
      setStatus('Please connect your wallet and initialize a store first');
      return;
    }

    try {
      setLoading(true);
      setStatus('Listing all pairs...');

      const tx = await program.methods
        .listAll()
        .accounts({
          store: storeAccount.publicKey
        })
        .rpc();

      const result = await connection.getTransaction(tx, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });

      if (result?.meta?.logMessages) {
        const pairs: { key: string; value: string }[] = [];
        result.meta.logMessages.forEach(log => {
          if (log.includes(' = ')) {
            const [key, value] = log.split(' = ');
            pairs.push({ key, value });
          }
        });
        setAllPairs(pairs);
        setStatus('Pairs listed successfully!');
      }
    } catch (error) {
      console.error('Error listing all pairs:', error);
      setStatus('Error listing pairs: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="key-value-store">
      <div className="wallet-section">
        <WalletMultiButton />
      </div>

      {publicKey && (
        <>
          <div className="store-section">
            <h2>Store Account: {storeAccount?.publicKey.toString()}</h2>
            <button onClick={initializeStore} disabled={loading}>
              Initialize Store
            </button>
          </div>

          <div className="save-section">
            <h2>Save Key-Value Pair</h2>
            <input
              type="text"
              placeholder="Key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <input
              type="text"
              placeholder="Value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <button onClick={handleSave} disabled={loading}>
              Save
            </button>
          </div>

          <div className="query-section">
            <h2>Query Key</h2>
            <input
              type="text"
              placeholder="Key to query"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button onClick={queryKey} disabled={loading}>
              Query
            </button>
            {queryResult && (
              <div className="query-result">
                <p>Result: {queryResult}</p>
              </div>
            )}
          </div>

          <div className="list-section">
            <h2>List All Pairs</h2>
            <button onClick={listAll} disabled={loading}>
              List All
            </button>
            {allPairs.length > 0 && (
              <div className="pairs-list">
                {allPairs.map((pair, index) => (
                  <div key={index}>
                    <strong>{pair.key}:</strong> {pair.value}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="status-section">
            <p>{status}</p>
          </div>
        </>
      )}
    </div>
  );
};

export default KeyValueStore; 