"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Metaplex, walletAdapterIdentity } from "@metaplex-foundation/js";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";

// Force devnet connection
const DEVNET_ENDPOINT = "https://api.devnet.solana.com";
const connection = new Connection(DEVNET_ENDPOINT, "confirmed");

export default function MintTweetNFT() {
  const wallet = useWallet();
  const [showWallets, setShowWallets] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  const abbreviatedAddress = useMemo(() => {
    const key = wallet.publicKey?.toBase58();
    if (!key) return "";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }, [wallet.publicKey]);

  // Check wallet balance on devnet
  useEffect(() => {
    const checkBalance = async () => {
      if (wallet.publicKey) {
        try {
          const balance = await connection.getBalance(wallet.publicKey);
          const solBalance = balance / LAMPORTS_PER_SOL;
          setWalletBalance(solBalance);
          console.log(`💰 Devnet balance: ${solBalance} SOL`);
        } catch (error) {
          console.error("Error checking balance:", error);
        }
      }
    };

    if (wallet.connected) {
      checkBalance();
    }
  }, [wallet.connected, wallet.publicKey]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowWallets(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowWallets(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (wallet.connected) setShowWallets(false);
  }, [wallet.connected]);

  const [tweetUrl, setTweetUrl] = useState("");
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [mintedNft, setMintedNft] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tweetData, setTweetData] = useState<any>(null);

  const fetchTweetPrice = async () => {
    setLoading(true);
    setError(null);
    setPrice(null);
    setTweetData(null);
    
    try {
      const res = await fetch(`http://localhost:3001/v1/fetchprice?url=${encodeURIComponent(tweetUrl)}`);
      const json = await res.json();
      
      console.log("API Response:", json);
      
      const metricsData = json?.metrics;
      const priceValue = json?.price;
      
      if (metricsData && metricsData.tweet_id) {
        console.log("Tweet data found:", metricsData);
        setTweetData(metricsData);
        
        if (priceValue !== undefined && priceValue !== null) {
          const parsed = typeof priceValue === "number" ? priceValue : parseFloat(String(priceValue));
          if (!Number.isNaN(parsed)) {
            console.log("Price set to:", parsed);
            setPrice(parsed);
          }
        }
      } else {
        console.error("No metrics or tweet_id found");
        setError("Could not fetch tweet data or tweetId.");
      }
    } catch (e: any) {
      console.error("Fetch error:", e);
      setError(e.message);
    }
    setLoading(false);
  };

  const mintNft = async () => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setError("Connect your wallet first.");
      return;
    }

    // Check if wallet has enough balance
    if (walletBalance !== null && walletBalance < 0.1) {
      setError(`Insufficient devnet SOL balance. You have ${walletBalance.toFixed(4)} SOL. Get devnet SOL from https://faucet.solana.com`);
      return;
    }

    setLoading(true);
    setError(null);

    let txSignature: string | null = null;
    let nftMintAddress: string | null = null;
    let metadataUri: string | null = null;

    try {
      if (!tweetData) {
        setError("Please fetch tweet data first.");
        setLoading(false);
        return;
      }

      const metadata = {
        name: `Tweet by @${tweetData.user?.screen_name || "unknown"}`,
        description: tweetData.text || "NFT representing a tweet on X",
        image: "https://via.placeholder.com/500x500.png?text=Tweet+NFT",
        attributes: [
          { trait_type: "Tweet ID", value: tweetData.tweet_id },
          { trait_type: "Author", value: tweetData.user?.name || "" },
          { trait_type: "Username", value: `@${tweetData.user?.screen_name || ""}` },
          { trait_type: "Likes", value: tweetData.likes || 0 },
          { trait_type: "Retweets", value: tweetData.retweets || 0 },
          { trait_type: "Views", value: tweetData.view_count || 0 },
        ],
        properties: {
          category: "tweet",
          external_url: tweetUrl,
        },
      };

      console.log("🌐 Network: DEVNET");
      console.log("📡 RPC Endpoint:", connection.rpcEndpoint);
      console.log("💰 Wallet Balance:", walletBalance, "SOL");
      
      // 🔍 CHECK IF TWEET ALREADY MINTED
      console.log("🔍 Checking if tweet already minted...");
      const uploadRes = await fetch("http://localhost:3001/v1/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          metadata,
          tweetId: tweetData.tweet_id,
          walletAddress: wallet.publicKey.toBase58(),
          tweetData: {
            tweet_id: tweetData.tweet_id,
            likes: tweetData.likes,
            retweets: tweetData.retweets,
            replies: tweetData.replies,
            view_count: tweetData.view_count,
          },
        }),
      });

      const uploadData = await uploadRes.json();

      // ⚠️ HANDLE ALREADY MINTED ERROR
      if (uploadRes.status === 409) {
        console.log("⚠️ Tweet already minted:", uploadData.data);
        setError(`This tweet has already been minted as an NFT!\n\nMint Address: ${uploadData.data.mintAddress}`);
        setLoading(false);
        
        // Show existing NFT details
        if (uploadData.data.mintAddress) {
          setMintedNft({
            address: { toBase58: () => uploadData.data.mintAddress },
            isExisting: true,
          });
        }
        return;
      }

      if (!uploadRes.ok) {
        throw new Error(uploadData.error || "Failed to upload metadata");
      }
      
      if (!uploadData.success || !uploadData.uri) {
        throw new Error(uploadData.error || "No URI returned from upload");
      }

      metadataUri = uploadData.uri;
console.log("✅ Metadata uploaded to:", metadataUri);

// Initialize Metaplex with explicit devnet connection
console.log("Initializing Metaplex on DEVNET...");
const metaplex = Metaplex.make(connection)
  .use(walletAdapterIdentity(wallet));

// Verify we're on devnet
const cluster = await connection.getGenesisHash();
console.log("🔗 Connected to cluster:", cluster);

console.log("Creating NFT on DEVNET...");

// ✅ Add null check here
if (!metadataUri) {
  throw new Error("Metadata URI is required but was not set");
}

const { nft, response } = await metaplex.nfts().create({
  uri: metadataUri, // TypeScript now knows this is string
  name: metadata.name,
  sellerFeeBasisPoints: 500,
});


      txSignature = response.signature;
      nftMintAddress = nft.address.toBase58();

      console.log("✅ NFT created successfully:", nftMintAddress);
      console.log("📝 Transaction signature:", txSignature);
      console.log("🔗 View on Solana Explorer:", `https://explorer.solana.com/address/${nftMintAddress}?cluster=devnet`);

      // 💾 SAVE TO DATABASE
      try {
        console.log("💾 Saving mint data to database...");
        
        const saveRes = await fetch("http://localhost:3001/v1/save-mint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tweetId: tweetData.tweet_id,
            mintAddress: nftMintAddress,
            ownerWallet: wallet.publicKey.toBase58(),
            metadataUri: metadataUri,
            priceSol: price,
            txSignature: txSignature,
            tweetData: {
              likes: tweetData.likes,
              retweets: tweetData.retweets,
              replies: tweetData.replies,
              view_count: tweetData.view_count,
            },
          }),
        });

        const saveData = await saveRes.json();
        
        if (saveData.success) {
          console.log("✅ Mint data saved to database");
        } else {
          console.warn("⚠️ Failed to save to database:", saveData.error);
          // Don't fail the whole process if DB save fails
        }
      } catch (dbError) {
        console.error("❌ Database save error:", dbError);
        // Continue even if DB save fails - NFT is still minted
      }

      setMintedNft(nft);
      
    } catch (err: any) {
      console.error("❌ Mint error:", err);
      console.error("Error details:", err);
      
      // Check if error is about "already processed" transaction
      const errorMsg = err.message || err.toString();
      const isAlreadyProcessed = 
        errorMsg.includes("already been processed") || 
        errorMsg.includes("AlreadyProcessed") ||
        errorMsg.includes("Transaction simulation failed");
      
      if (isAlreadyProcessed) {
        console.log("⚠️ Transaction was already processed. Checking if NFT was created...");
        
        // If we have a signature, try to fetch the transaction to get the NFT address
        if (txSignature || err.cause?.signature) {
          const sig = txSignature || err.cause?.signature;
          console.log("🔍 Looking up transaction:", sig);
          
          try {
            // Wait a bit for the transaction to finalize
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const txInfo = await connection.getTransaction(sig, {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            });
            
            if (txInfo) {
              console.log("✅ Transaction found and confirmed!");
              
              // Try to extract NFT mint address from transaction logs
              const logs = txInfo.meta?.logMessages || [];
              console.log("Transaction logs:", logs);
              
              // Look for mint address in account keys
              const accounts = txInfo.transaction.message.getAccountKeys();
              if (accounts && accounts.length > 0) {
                const possibleMint = accounts.get(0)?.toBase58();
                
                if (possibleMint && metadataUri) {
                  console.log("🎉 NFT likely minted at:", possibleMint);
                  
                  // Try to save to database even with the error
                  try {
                    await fetch("http://localhost:3001/v1/metadata/save-mint", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tweetId: tweetData.tweet_id,
                        mintAddress: possibleMint,
                        ownerWallet: wallet.publicKey!.toBase58(),
                        metadataUri: metadataUri,
                        priceSol: price,
                        txSignature: sig,
                        tweetData: {
                          likes: tweetData.likes,
                          retweets: tweetData.retweets,
                          replies: tweetData.replies,
                          view_count: tweetData.view_count,
                        },
                      }),
                    });
                  } catch (dbErr) {
                    console.error("Failed to save recovered mint:", dbErr);
                  }
                  
                  setMintedNft({ 
                    address: { toBase58: () => possibleMint }
                  });
                  setError(null);
                  setLoading(false);
                  return;
                }
              }
            }
          } catch (lookupErr) {
            console.error("Error looking up transaction:", lookupErr);
          }
        }
        
        setError("Transaction was submitted successfully but confirmation timed out. Check your wallet or Solana Explorer for the NFT.");
      } else {
        // Handle other errors
        let errorMessage = errorMsg;
        
        if (errorMessage.includes("insufficient")) {
          errorMessage = `Insufficient SOL balance. Get devnet SOL from https://faucet.solana.com`;
        } else if (errorMessage.includes("blockhash")) {
          errorMessage = "Transaction expired. Please try again.";
        } else if (errorMessage.includes("User rejected")) {
          errorMessage = "Transaction was rejected in your wallet.";
        }
        
        setError(errorMessage);
      }
    }
    
    setLoading(false);
  };

  return (
    <div className="mint-tweet-nft" style={{ maxWidth: 500, margin: "48px auto" }}>
      <h2>Mint a Tweet as NFT</h2>
      <div style={{ marginBottom: "1rem", padding: "0.5rem", background: "#e3f2fd", borderRadius: "4px" }}>
        <small>
          🌐 Network: <strong>Devnet</strong>
          {walletBalance !== null && (
            <span style={{ marginLeft: "1rem" }}>
              💰 Balance: <strong>{walletBalance.toFixed(4)} SOL</strong>
            </span>
          )}
          {walletBalance !== null && walletBalance < 0.1 && (
            <div style={{ color: "#d32f2f", marginTop: "0.25rem" }}>
              ⚠️ Low balance! Get devnet SOL: <a href="https://faucet.solana.com" target="_blank" rel="noopener">faucet.solana.com</a>
            </div>
          )}
        </small>
      </div>
      
      <div ref={menuRef} className="relative inline-block text-left">
        {wallet.connected ? (
          <div className="flex items-center gap-2">
            <button
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-2 text-sm"
              onClick={() => setShowWallets((v) => !v)}
            >
              {abbreviatedAddress || "Wallet"}
            </button>
            <button
              className="bg-red-600 hover:bg-red-700 text-white rounded px-3 py-2 text-sm"
              onClick={() => wallet.disconnect()}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded px-3 py-2 text-sm"
            onClick={() => setShowWallets((v) => !v)}
          >
            Connect Wallet
          </button>
        )}

        {showWallets && (
          <div className="absolute z-10 mt-2 w-56 origin-top-right rounded-md bg-[#2c2d30] shadow-lg ring-1 ring-black/5 focus:outline-none">
            <div className="py-1">
              {wallet.wallets.map((w) => (
                <button
                  key={w.adapter.name}
                  className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-[#1a1f2e]"
                  onClick={async () => {
                    try {
                      await wallet.select(w.adapter.name);
                      await wallet.connect();
                      setShowWallets(false);
                    } catch {}
                  }}
                >
                  {w.adapter.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <form
        onSubmit={e => {
          e.preventDefault();
          fetchTweetPrice();
        }}
        style={{ margin: "1rem 0" }}
      >
        <input
          type="text"
          className="tweet-url-input"
          placeholder="Paste the Tweet URL here"
          value={tweetUrl}
          onChange={e => setTweetUrl(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 8 }}
        />
        <button type="submit" disabled={!tweetUrl || loading}>
          {loading ? "Loading..." : "Get Price"}
        </button>
      </form>
      {tweetData && (
        <div style={{ marginTop: "1rem", padding: "1rem", background: "#f5f5f5", borderRadius: "8px" }}>
          <h4 style={{ marginTop: 0 }}>Tweet Details</h4>
          <p><strong>Author:</strong> {tweetData.user?.name} (@{tweetData.user?.screen_name})</p>
          <p><strong>Tweet:</strong> {tweetData.text}</p>
          <p><strong>Stats:</strong> {tweetData.likes} likes, {tweetData.retweets} retweets, {tweetData.view_count} views</p>
        </div>
      )}
      {price !== null && (
        <div>
          <h3>
            Price to Mint: <span>{price.toFixed(4)} SOL</span>
          </h3>
          <button
            disabled={loading || !wallet.connected || (walletBalance !== null && walletBalance < 0.1)}
            onClick={mintNft}
            style={{ marginTop: "16px" }}
          >
            {loading ? "Minting..." : "Mint NFT"}
          </button>
        </div>
      )}
      {error && (
        <div style={{ 
          color: "red", 
          marginTop: 16, 
          padding: "1rem", 
          background: "#ffebee", 
          borderRadius: "4px",
          whiteSpace: "pre-wrap" 
        }}>
          {error}
        </div>
      )}
      {mintedNft && (
        <div style={{ marginTop: 32, padding: "1rem", background: "#e8f5e9", borderRadius: "8px" }}>
          <h4 style={{ color: "#2e7d32", marginTop: 0 }}>
            {(mintedNft as any).isExisting ? "✅ Existing NFT" : "🎉 NFT Minted Successfully!"}
          </h4>
          <div>
            <span>Mint Address: </span>
            <span style={{ fontFamily: "monospace", fontSize: "0.9em" }}>
              {mintedNft.address.toBase58()}
            </span>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <a
              href={`https://explorer.solana.com/address/${mintedNft.address.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1976d2", textDecoration: "underline" }}
            >
              View on Solana Explorer (Devnet) →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
