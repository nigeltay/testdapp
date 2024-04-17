"use client";
import React, { FC, useMemo, useCallback, useEffect, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import {
  WalletAdapterNetwork,
  WalletNotConnectedError,
} from "@solana/wallet-adapter-base";
import {
  clusterApiUrl,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  PublicKey,
  Connection,
} from "@solana/web3.js";
import {
  createMint,
  getMint,
  MINT_SIZE,
  ACCOUNT_SIZE,
  TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
  createInitializeMintInstruction,
  createInitializeAccountInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
} from "@solana/spl-token";

import styles from "../src/app/page.module.css";

function SignTransaction() {
  //
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [transactionHash, setTransactionHash] = useState<string | null>(null); 

  const receiverAddress = new PublicKey(
    "WEBcSrGzGcc3NhhHuNkxtxvFx7bkCvjpQs1gZaZ9YBi"
  );

  const checkIfTokenAccountExists = async (tokenAccountAddress: PublicKey) => {
    // Check if the receiver's token account exists
    try {
      await getAccount(connection, tokenAccountAddress);
     
      return true;
    } catch (thrownObject) {
      const error = thrownObject as Error;
      // error.message is am empty string
      // TODO: fix upstream
      if (error.name === "TokenAccountNotFoundError") {
        return false;
      }

      throw error;
    }
  };

  const handleNFTTransaction = useCallback(async () => {
    try {
      //devnet SIGN token mint address
      const mintAccountPublicKey = new PublicKey(
        "hQMaoSZUbyjXBRLwE7m5SHUXet79wJqWJcd8a8kM7C7"
      );
      //let mintAccount = await getMint(connection, mintAccountPublicKey);

      if (!publicKey) throw new WalletNotConnectedError();

      let userTokenAddress = await getAssociatedTokenAddress(
        mintAccountPublicKey, // mint
        publicKey, // user
        true // allowOwnerOffCurve
      );

      console.log(`User ATA: ${userTokenAddress.toString()}`);
      const userTokenAccountExists = await checkIfTokenAccountExists(
        userTokenAddress
      );

      if (!userTokenAccountExists) {
        console.log(`userTokenAccount does not exists, creating one....`);
        let transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            userTokenAddress,
            publicKey,
            mintAccountPublicKey,
            TOKEN_PROGRAM_ID
          )
        );

        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
        });

        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        });

        alert(`Transaction confirmed: ${signature}`);
      }

      //if exits check token account balance
      let tokenAccountBalance= await connection.getTokenAccountBalance(userTokenAddress);

      const decimalPlaces = tokenAccountBalance.value.decimals
      const tokenValue = parseFloat(tokenAccountBalance.value.amount)/ Math.pow(10, decimalPlaces)
      // console.log(`amount: ${parseInt(tokenAccountBalance.value.amount)}`);
      // console.log(`decimals: ${tokenAccountBalance.value.decimals}`);

      if(tokenValue < 25){
        alert('You need 25 SIGN tokens to notarise a document.')
        return
      }
      // console.log(tokenValue)


      //receiver token account
      let receiverTokenAddress = await getAssociatedTokenAddress(
        mintAccountPublicKey, // mint
        receiverAddress, // receiver
        true // allowOwnerOffCurve
      );

      console.log(`receiver ATA: ${receiverTokenAddress.toString()}`);

      const receiverTokenAccountExists = await checkIfTokenAccountExists(
        receiverTokenAddress
      );

      if (!receiverTokenAccountExists) {
        console.log(`receiverTokenAccount does not exists, creating one....`);
        let transaction = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            receiverTokenAddress,
            receiverAddress, //owner 
            mintAccountPublicKey,
            TOKEN_PROGRAM_ID
          )
        );

        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        const signature = await sendTransaction(transaction, connection, {
          minContextSlot,
        });

        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        });

        alert(`Transaction confirmed: ${signature}`);
      }

      const transaction = new Transaction().add(
        createTransferCheckedInstruction(
          userTokenAddress, // from (should be a token account)
          mintAccountPublicKey, // mint
          receiverTokenAddress, // to (should be a token account)
          publicKey, // from's owner
          25e9, // amount, if your deciamls is 8, send 10^8 for 1 token
          9 // decimals
        )
      );

      transaction.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: receiverAddress,
          lamports: 0, //solanaWeb3.LAMPORTS_PER_SOL / 100,
        })
      );

        //example
        const message = {
          checkSum:
            "0xc0b1ce7ee4d071f7700690b9c07b244c015e3df594303ec88b118f7535f8ece6",
          id: "6ca4270e078f48cd82ced540b9d9c11d",
          ownerId: "384b46f3830a46fc899d7fb9bd48b5ff",
          recipients: ["384b46f3830a46fc899d7fb9bd48b5ff"],
        };
  
        transaction.add(
          new TransactionInstruction({
            keys: [{ pubkey: publicKey, isSigner: true, isWritable: true }],
            data: Buffer.from(JSON.stringify(message), "utf-8"),
            programId: new PublicKey(
              "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
            ),
          })
        );


      const {
        context: { slot: minContextSlot },
        value: { blockhash, lastValidBlockHeight },
      } = await connection.getLatestBlockhashAndContext();

      const signature = await sendTransaction(transaction, connection, {
        minContextSlot,
      });

      await connection.confirmTransaction({
        blockhash,
        lastValidBlockHeight,
        signature,
      });

      alert(`Transaction confirmed: ${signature}`);

      setTransactionHash(signature)
    } catch (error) {
      alert(`Error: ${error}`);
      return;
    }
  }, [publicKey, sendTransaction, connection]);

  const handleSignAndSendTransaction = useCallback(async () => {
    try {
      if (!publicKey) throw new WalletNotConnectedError();

      // 890880 lamports as of 2022-09-01
      const lamports = await connection.getMinimumBalanceForRentExemption(0);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: receiverAddress,
          lamports: 0, //solanaWeb3.LAMPORTS_PER_SOL / 100,
        })
        //add transfer SIGN token transaction here
      );

      //example
      const message = {
        checkSum:
          "0xc0b1ce7ee4d071f7700690b9c07b244c015e3df594303ec88b118f7535f8ece6",
        id: "6ca4270e078f48cd82ced540b9d9c11d",
        ownerId: "384b46f3830a46fc899d7fb9bd48b5ff",
        recipients: ["384b46f3830a46fc899d7fb9bd48b5ff"],
      };

      transaction.add(
        new TransactionInstruction({
          keys: [{ pubkey: publicKey, isSigner: true, isWritable: true }],
          data: Buffer.from(JSON.stringify(message), "utf-8"),
          programId: new PublicKey(
            "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
          ),
        })
      );

      const {
        context: { slot: minContextSlot },
        value: { blockhash, lastValidBlockHeight },
      } = await connection.getLatestBlockhashAndContext();

      const signature = await sendTransaction(transaction, connection, {
        minContextSlot,
      });

      await connection.confirmTransaction({
        blockhash,
        lastValidBlockHeight,
        signature,
      });

      alert(`Transaction confirmed: ${signature}`);
    } catch (error) {
      alert(`Error: ${error}`);
      return;
    }
  }, [publicKey, sendTransaction, connection]);

  return (
    <>
    {publicKey !== null && (
  <div>
    <h2 style={{ padding: "10px", marginTop: "15px", }}>Create transaction with note</h2>
    <button
      style={{
        color: "black",
        backgroundColor: "orange",
        padding: "10px",
        borderRadius: "5px",
        margin: "5px",
        border: "none",
        cursor: "pointer",
        transition: "background-color 0.3s ease",
      }}
      onClick={handleNFTTransaction}
    >
      Sign and send transaction
    </button>
    {transactionHash !== null && (
          <a
            className={styles.success}
            target="_blank"
            href={`https://explorer.solana.com/tx/${transactionHash}?cluster=devnet`}
            rel="noreferrer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="192"
              height="192"
              fill="currentColor"
              viewBox="0 0 256 256"
            >
              <rect width="256" height="256" fill="none"></rect>
              <polyline
                points="172 104 113.3 160 84 132"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="24"
              ></polyline>
              <circle
                cx="128"
                cy="128"
                r="96"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="24"
              ></circle>
            </svg>
            <div className={styles.ellipsisContainer}>
              <p>
                <strong>Transaction completed</strong> at the following address
              </p>
              <div className={styles.ellipsis}>
                <code>{transactionHash}</code>
              </div>
            </div>
          </a>
        )}
  </div>
)}

    </>
  );
}

export default SignTransaction;
