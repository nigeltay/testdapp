"use client";

import Image from "next/image";
import styles from "./page.module.css";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, FormEvent } from "react";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  WalletProvider,
  useWallet,
  useConnection,
  ConnectionProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  base58PublicKey,
  generateSigner,
  Option,
  PublicKey,
  createGenericFileFromBrowserFile,
  percentAmount,
  publicKey,
  SolAmount,
  some,
  transactionBuilder,
  Umi,
} from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
// import { setComputeUnitLimit } from '@metaplex-foundation/mpl-essentials';
import {
  mplTokenMetadata,
  TokenStandard,
  createNft,
} from "@metaplex-foundation/mpl-token-metadata";
import { nftStorageUploader } from "@metaplex-foundation/umi-uploader-nft-storage";
import SignTransaction from "../../components/Notarise";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import * as solanaWeb3 from "@solana/web3.js";

const WalletMultiButtonDynamic = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const checkIfTokenAccountExists = async (
  connection: solanaWeb3.Connection,
  tokenAccountAddress: solanaWeb3.PublicKey
) => {
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

export default function Home() {
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [mintCreated, setMintCreated] = useState<PublicKey | null>(null);
  const [tokenTransferred, setTokenTransferred] = useState<string | null>(null);

  const [pageStatus, setPageStatus] = useState<string>("Home");

  const network =
    process.env.NEXT_PUBLIC_NETWORK === "devnet"
      ? WalletAdapterNetwork.Devnet
      : // : process.env.NEXT_PUBLIC_NETWORK === "testnet"
        // ? WalletAdapterNetwork.Testnet
        WalletAdapterNetwork.Mainnet;

  const endpoint = `https://${process.env.NEXT_PUBLIC_RPC_URL}`;

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter({ network }),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );

  const nftStorageToken = process.env.NEXT_PUBLIC_NFT_STORAGE_TOKEN as string;

  let umi = createUmi(endpoint)
    .use(walletAdapterIdentity(wallet))
    .use(nftStorageUploader({ token: nftStorageToken }))
    .use(mplTokenMetadata());

  const PageContent = () => {
    const wallet = useWallet();
    const { connection } = useConnection();
    umi = umi.use(walletAdapterIdentity(wallet));

    async function uploadAndCreateNft(
      umi: Umi,
      name: string,
      description: string,
      file: File,
      pdfFile: File
    ) {
      if (wallet.publicKey == null) {
        alert("Please connect your wallet");
        return null;
      }

      // Ensure input is valid.
      if (!name) {
        alert("Please enter a name for your NFT.");
        return null;
      }
      if (!description) {
        alert("Please enter a description for your NFT.");
        return null;
      }
      if (!file || file.size === 0) {
        alert("Please select an thumbnail for your NFT.");
        return null;
      }
      if (!pdfFile || pdfFile.size === 0) {
        alert("Please upload an pdf for your NFT.");
        return null;
      }

      // Upload pdf and image to NFT storage.
      const imageFile = await createGenericFileFromBrowserFile(file);
      const [imageUri] = await umi.uploader.upload([imageFile]);

      const pdfFileData = await createGenericFileFromBrowserFile(pdfFile);
      const [pdfFileUri] = await umi.uploader.upload([pdfFileData]);

      //upload JSON data to NFT storage
      const uri = await umi.uploader.uploadJson({
        name,
        description,
        image: imageUri, //must be image key
        pdfFile: pdfFileUri,
      });

      // Create and mint NFT.
      const mint = generateSigner(umi);
      const sellerFeeBasisPoints = percentAmount(0, 2); //for royalty
      await createNft(umi, {
        mint,
        name,
        uri,
        sellerFeeBasisPoints,
      }).sendAndConfirm(umi);

      // transfer SIGN token to hot wallet receiver
      const receiverAddress = new solanaWeb3.PublicKey(
        "WEBcSrGzGcc3NhhHuNkxtxvFx7bkCvjpQs1gZaZ9YBi"
      );

      //devnet SIGN token mint address
      const mintAccountPublicKey = new solanaWeb3.PublicKey(
        "hQMaoSZUbyjXBRLwE7m5SHUXet79wJqWJcd8a8kM7C7"
      );

      let userTokenAddress = await getAssociatedTokenAddress(
        mintAccountPublicKey, // mint
        wallet.publicKey, // user
        true // allowOwnerOffCurve
      );

      const userTokenAccountExists = await checkIfTokenAccountExists(
        connection,
        userTokenAddress
      );

      if (!userTokenAccountExists) {
        console.log(`userTokenAccount does not exists, creating one....`);
        let transaction = new solanaWeb3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            userTokenAddress,
            wallet.publicKey,
            mintAccountPublicKey,
            TOKEN_PROGRAM_ID
          )
        );

        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await connection.getLatestBlockhashAndContext();

        const signature = await wallet.sendTransaction(
          transaction,
          connection,
          {
            minContextSlot,
          }
        );

        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        });

        alert(`Transaction confirmed: ${signature}`);
      }

      let receiverTokenAddress = await getAssociatedTokenAddress(
        mintAccountPublicKey, // mint
        receiverAddress // receiver
      );

      const receiverTokenAccountExists = await checkIfTokenAccountExists(
        connection,
        receiverTokenAddress
      );

      if (!receiverTokenAccountExists) {
        console.log(`receiverTokenAccount does not exists, creating one....`);
        let transaction = new solanaWeb3.Transaction().add(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
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

        const signature = await wallet.sendTransaction(
          transaction,
          connection,
          {
            minContextSlot,
          }
        );

        await connection.confirmTransaction({
          blockhash,
          lastValidBlockHeight,
          signature,
        });

        alert(`Transaction confirmed: ${signature}`);
      }

      const transaction = new solanaWeb3.Transaction().add(
        createTransferCheckedInstruction(
          userTokenAddress, // from (should be a token account)
          mintAccountPublicKey, // mint
          receiverTokenAddress, // to (should be a token account)
          wallet.publicKey, // from's owner
          25e9, // amount, if your deciamls is 9, send 1e9 for 1 token
          9 // decimals
        )
      );

      const {
        context: { slot: minContextSlot },
        value: { blockhash, lastValidBlockHeight },
      } = await connection.getLatestBlockhashAndContext();

      const signature = await wallet.sendTransaction(transaction, connection, {
        minContextSlot,
      });

      await connection.confirmTransaction({
        blockhash,
        lastValidBlockHeight,
        signature,
      });

      //alert(`Transaction confirmed: ${signature}`);
      setTokenTransferred(signature);

      // Return the mint address.
      return mint.publicKey;
    }

    const onSubmit = async (event: FormEvent) => {
      event.preventDefault();
      setLoading(true);
      setPageStatus("Loading");

      const formData = new FormData(event.target as HTMLFormElement);
      const data = Object.fromEntries(formData) as {
        name: string;
        description: string;
        image: File;
        pdfFile: File;
      };

      try {
        const mint = await uploadAndCreateNft(
          umi,
          data.name,
          data.description,
          data.image,
          data.pdfFile
        );
        if (mint != null) {
          setMintCreated(mint);
        }
      } finally {
        setLoading(false);
        setPageStatus("Success");
      }
    };

    if (!wallet.connected) {
      return <h3>Please connect your solfare or phantom wallet to get started. Make sure it connected to devnet.</h3>;
    }

    return (
      <>
        {pageStatus === "Home" && (
          <form method="post" onSubmit={onSubmit} className={styles.form}>
            <h2 style={{marginTop: '20px'}}>Create an NFT</h2>

            <label className={styles.field}>
              <span>Name</span>
              <input name="name" placeholder="Name of NFT" defaultValue="" />
            </label>
            <label className={styles.field}>
              <span>Description</span>
              <input
                name="description"
                placeholder="Token description"
                defaultValue=""
              />
            </label>
            <label className={styles.field}>
              <span>PDF thumbnail</span>
              <input name="image" type="file" accept="image/*" />
            </label>
            <label className={styles.field}>
              <span>PDF document</span>
              <input name="pdfFile" type="file" accept="application/pdf" />
            </label>
            <button type="submit">
              <span>Create NFT</span>
              <svg
                aria-hidden="true"
                role="img"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 448 512"
              >
                <path
                  fill="currentColor"
                  d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"
                ></path>
              </svg>
            </button>
          </form>
        )}

        {loading && (
          <div className={styles.loading}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="192"
              height="192"
              fill="currentColor"
              viewBox="0 0 256 256"
            >
              <rect width="256" height="256" fill="none"></rect>
              <path
                d="M168,40.7a96,96,0,1,1-80,0"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="24"
              ></path>
            </svg>
            <p>Creating the NFT...</p>
          </div>
        )}

        {tokenTransferred !== null && (
          <a
            className={styles.success}
            target="_blank"
            href={`https://solscan.io/tx/${tokenTransferred}?cluster=devnet`}
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
                <strong>SIGN Token transferred</strong> at the following address
              </p>
              <div className={styles.ellipsis}>
                <code>{tokenTransferred}</code>
              </div>
            </div>
          </a>
        )}
        {mintCreated && (
          <a
            className={styles.success}
            target="_blank"
            href={`https://www.solaneyes.com/address/${base58PublicKey(
              mintCreated
            )}?cluster=devnet`}
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
            <div>
              <p>
                <strong>NFT Created</strong> at the following address
              </p>
              <p>
                <code>{mintCreated}</code>
              </p>
            </div>
          </a>
        )}
        {pageStatus === "Success" && (
          <button
            style={{
              color: "white",
              backgroundColor: "grey",
              padding: "10px",
              borderRadius: "5px",
              margin: "5px",
              border: "none",
              cursor: "pointer",
              transition: "background-color 0.3s ease",
            }}
            onClick={() => {
              setPageStatus("Home")
              setMintCreated(null)
              setTokenTransferred(null)
            }}
          >
            Back to home
          </button>
        )}
      </>
    );
  };

  return (
    <>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          <WalletModalProvider>
            <main className={styles.main}>
              <div className={styles.wallet}>
                <WalletMultiButtonDynamic />
              </div>

              <div className={styles.center}>
                <SignTransaction />

                <PageContent />
              </div>
            </main>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </>
  );
}
