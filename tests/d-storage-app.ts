import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { DStorageApp } from "../target/types/d_storage_app";

describe("d-storage-app", () => {
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);
  const program = anchor.workspace.DStorageApp as Program<DStorageApp>;

  it("Should save and query key-value pair", async () => {
    // Create a new keypair for the data account
    const dataAccount = anchor.web3.Keypair.generate();
    const key = "test_key";
    const value = "test_value";

    // Save the key-value pair
    const saveTx = await program.methods.save(key, value).accounts({
      data: dataAccount.publicKey,
      signer: provider.wallet.publicKey,
      system_program: anchor.web3.SystemProgram.programId,
    }).signers([dataAccount]).rpc();

    // Wait for transaction confirmation
    await provider.connection.confirmTransaction({
      signature: saveTx,
      blockhash: (await provider.connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight: (await provider.connection.getLatestBlockhash()).lastValidBlockHeight,
    });

    // Add a small delay to ensure transaction is processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Query the key-value pair
    const queryTx = await program.methods.query().accounts({
      data: dataAccount.publicKey,
    }).rpc();

    // Wait for transaction confirmation
    await provider.connection.confirmTransaction({
      signature: queryTx,
      blockhash: (await provider.connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight: (await provider.connection.getLatestBlockhash()).lastValidBlockHeight,
    });

    // Add a small delay to ensure transaction is processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get transaction details
    const tx = await provider.connection.getTransaction(queryTx, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });

    if (!tx) {
      throw new Error("Transaction not found");
    }

    // Debug output
    console.log("Program logs:", tx.meta.logMessages);

    // Assert verification
    expect(tx.meta.logMessages).to.satisfy((logs: string[]) =>
      logs.some(log => log.includes(`Query result: ${key} = ${value}`))
    );
  });
});
