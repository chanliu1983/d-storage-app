import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { DStorageApp } from "../target/types/d_storage_app";

describe("d-storage-app", () => {
  const provider = anchor.AnchorProvider.env();

  anchor.setProvider(provider);
  const program = anchor.workspace.DStorageApp as Program<DStorageApp>;

  it("Should log program ID", async () => {
    // Create a new keypair for the data account
    const dataAccount = anchor.web3.Keypair.generate();

    // 发送交易
    const txSignature = await program.methods.initialize().accounts({
      data: dataAccount.publicKey,
      signer: provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([dataAccount]).rpc();

    // 等待交易确认
    await provider.connection.confirmTransaction({
      signature: txSignature,
      blockhash: (await provider.connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight: (await provider.connection.getLatestBlockhash()).lastValidBlockHeight,
    });

    // Add a small delay to ensure transaction is processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 获取交易详情
    const tx = await provider.connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });

    if (!tx) {
      throw new Error("Transaction not found");
    }

    // 调试输出
    console.log("Program logs:", tx.meta.logMessages);

    // 断言验证
    expect(tx.meta.logMessages).to.satisfy((logs: string[]) =>
      logs.some(log => log.includes("Greetings from"))
    );
  });
});
