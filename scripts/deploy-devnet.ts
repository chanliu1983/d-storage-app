import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { DStorageApp } from "../target/types/d_storage_app";

async function main() {
  // Configure the client to use devnet
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.DStorageApp as Program<DStorageApp>;

  console.log("Program ID:", program.programId.toString());

  // Create a new keypair for the store account
  const storeAccount = anchor.web3.Keypair.generate();
  console.log("Store Account:", storeAccount.publicKey.toString());

  try {
    // Initialize the store
    console.log("Initializing store...");
    const initTx = await program.methods.initialize().accounts({
      store: storeAccount.publicKey,
      signer: provider.wallet.publicKey,
    }).remainingAccounts([{
      pubkey: anchor.web3.SystemProgram.programId,
      isWritable: false,
      isSigner: false
    }]).signers([storeAccount]).rpc();

    console.log("Init transaction:", initTx);
    await provider.connection.confirmTransaction({
      signature: initTx,
      blockhash: (await provider.connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight: (await provider.connection.getLatestBlockhash()).lastValidBlockHeight,
    });

    // Add a small delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Save multiple key-value pairs
    const pairs = [
      { key: "name", value: "John Doe" },
      { key: "age", value: "30" },
      { key: "city", value: "New York" }
    ];

    for (const pair of pairs) {
      console.log(`Saving ${pair.key} = ${pair.value}...`);
      const saveTx = await program.methods.save(pair.key, pair.value).accounts({
        store: storeAccount.publicKey,
        signer: provider.wallet.publicKey,
      }).rpc();

      console.log("Save transaction:", saveTx);
      await provider.connection.confirmTransaction({
        signature: saveTx,
        blockhash: (await provider.connection.getLatestBlockhash()).blockhash,
        lastValidBlockHeight: (await provider.connection.getLatestBlockhash()).lastValidBlockHeight,
      });

      // Add a small delay
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Query a specific key
    console.log("Querying 'name'...");
    const queryTx = await program.methods.query("name").accounts({
      store: storeAccount.publicKey,
    }).rpc();

    console.log("Query transaction:", queryTx);
    const queryResult = await provider.connection.getTransaction(queryTx, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });

    if (queryResult) {
      console.log("Query logs:", queryResult.meta.logMessages);
    }

    // List all key-value pairs
    console.log("Listing all key-value pairs...");
    const listTx = await program.methods.listAll().accounts({
      store: storeAccount.publicKey,
    }).rpc();

    console.log("List transaction:", listTx);
    const listResult = await provider.connection.getTransaction(listTx, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });

    if (listResult) {
      console.log("List logs:", listResult.meta.logMessages);
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
); 