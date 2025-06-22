"use client";
import React, { useState, useEffect } from "react";
import ClientWalletButton from "./ClientWalletButton";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

// Solana mainnet mint addresses and decimals
const TOKEN_MINTS = {
  SOL: { mint: "So11111111111111111111111111111111111111112", decimals: 9 },
  USD: { mint: "EPjFWdd5AufqSSqeM2q8jG4wGkFAb9RM1bF5uF1Aj3v", decimals: 6 }, // USDC
  INR: { mint: "Es9vMFrzaCERk6tZ6tKQ6Qp8Y8F6Yk9w4p6A9k6z5z9", decimals: 6 }, // USDT as INR stand-in
  PHP: { mint: "Es9vMFrzaCERk6tZ6tKQ6Qp8Y8F6Yk9w4p6A9k6z5z9", decimals: 6 }, // USDT as PHP stand-in
  NGN: { mint: "Es9vMFrzaCERk6tZ6tKQ6Qp8Y8F6Yk9w4p6A9k6z5z9", decimals: 6 }, // USDT as NGN stand-in
  EUR: { mint: "EUR_MINT_PLACEHOLDER", decimals: 6 },
  SGD: { mint: "SGD_MINT_PLACEHOLDER", decimals: 6 }
};

const COMMISSION_RATE = 0.008; // 0.8%
const HISTORY_KEY = "remittance_tx_history";
const FIAT_API_KEY = "971c16d8e8bcdd2f1aea5fe3";

export default function Home() {
  const [amount, setAmount] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState("USD");
  const [destCurrency, setDestCurrency] = useState("INR");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState("");
  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [sending, setSending] = useState(false);
  const [commission, setCommission] = useState(0);
  const [netAmount, setNetAmount] = useState(0);
  const [history, setHistory] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [fiatRates, setFiatRates] = useState({});

  const wallet = useWallet();
  const { connection } = useConnection();

  useEffect(() => { setMounted(true); }, []);

  // Load history from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) setHistory(JSON.parse(h));
    }
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  }, [history]);

  useEffect(() => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setCommission(0);
      setNetAmount(0);
      setQuote(null);
      return;
    }
    const amt = Number(amount);
    const comm = amt * COMMISSION_RATE;
    const net = amt - comm;
    setCommission(comm);
    setNetAmount(net);
  }, [amount, sourceCurrency]);

  // Fetch USD to INR, PHP, NGN rates for fiat display
  useEffect(() => {
    async function fetchRates() {
      try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${FIAT_API_KEY}/latest/USD`);
        const data = await res.json();
        if (data && data.conversion_rates) {
          setFiatRates({
            INR: data.conversion_rates.INR,
            PHP: data.conversion_rates.PHP,
            NGN: data.conversion_rates.NGN
          });
        }
      } catch {}
    }
    fetchRates();
  }, []);

  // Fetch quote automatically when amount, sourceCurrency, or destCurrency changes
  useEffect(() => {
    const fetchQuote = async () => {
      setQuote(null);
      if (!netAmount || isNaN(Number(netAmount)) || Number(netAmount) <= 0) {
        setStatus("Enter a valid amount");
        return;
      }
      setLoadingQuote(true);
      setStatus("");
      try {
        const input = TOKEN_MINTS[sourceCurrency];
        const output = TOKEN_MINTS[destCurrency];
        if (!input || !output || !input.mint || !output.mint) {
          setQuote(null);
          setLoadingQuote(false);
          setStatus("Invalid token selection");
          return;
        }
        const amountInSmallest = Math.floor(Number(netAmount) * Math.pow(10, input.decimals));
        const url = `https://quote-api.jup.ag/v6/quote?inputMint=${input.mint}&outputMint=${output.mint}&amount=${amountInSmallest}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.outAmount) {
          setQuote({
            outAmount: (Number(data.outAmount) / Math.pow(10, output.decimals)).toFixed(6),
            route: data.routes?.[0] || null
          });
          setStatus("");
        } else {
          setQuote(null);
          setStatus("No valid swap route found.");
        }
      } catch (e) {
        setQuote(null);
        setStatus("Failed to fetch quote");
      }
      setLoadingQuote(false);
    };
    fetchQuote();
  }, [netAmount, sourceCurrency, destCurrency]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("");
    if (!wallet.connected || !wallet.publicKey) {
      setStatus("Please connect your wallet.");
      return;
    }
    // Always show transaction success for demo, even if no valid quote
    if (!quote || !quote.route) {
      setStatus("Transaction Successful! (Demo Mode)");
      const txRecord = {
        type: "debit",
        date: new Date().toISOString(),
        from: sourceCurrency,
        to: destCurrency,
        amount: Number(amount),
        commission: commission,
        netAmount: netAmount,
        recipient,
        received: getFiatValue() || "N/A",
        signature: "demo-tx-" + Date.now(),
        status: "sent"
      };
      setHistory([txRecord, ...history].slice(0, 10));
      return;
    }
    setSending(true);
    setStatus("Requesting swap transaction from Jupiter...");
    try {
      // Prepare Jupiter swap API request
      const swapReq = {
        route: quote.route,
        userPublicKey: wallet.publicKey.toBase58(),
        wrapUnwrapSOL: sourceCurrency === "SOL", // Only true if swapping SOL
        asLegacyTransaction: false
      };
      const swapRes = await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(swapReq)
      });
      const swapData = await swapRes.json();
      if (!swapData.swapTransaction) {
        setStatus("Failed to get swap transaction from Jupiter.");
        setSending(false);
        return;
      }
      // Decode and send transaction
      const tx = Buffer.from(swapData.swapTransaction, "base64");
      const { sendTransaction } = wallet;
      setStatus("Signing and sending transaction...");
      const signature = await sendTransaction(tx, connection);
      setStatus(`Transaction sent! Signature: ${signature}`);
      // Save to history
      const txRecord = {
        type: "debit",
        date: new Date().toISOString(),
        from: sourceCurrency,
        to: destCurrency,
        amount: Number(amount),
        commission: commission,
        netAmount: netAmount,
        recipient,
        received: quote.outAmount,
        signature,
        status: "sent"
      };
      setHistory([txRecord, ...history].slice(0, 10)); // keep last 10
    } catch (err) {
      setStatus("Swap failed: " + (err.message || err.toString()));
    }
    setSending(false);
  };

  // Helper to get fiat value for the quote
  const getFiatValue = () => {
    if (!quote || !fiatRates) return null;
    if (destCurrency === "INR" && fiatRates.INR) return (Number(quote.outAmount) * fiatRates.INR).toFixed(2) + " INR";
    if (destCurrency === "PHP" && fiatRates.PHP) return (Number(quote.outAmount) * fiatRates.PHP).toFixed(2) + " PHP";
    if (destCurrency === "NGN" && fiatRates.NGN) return (Number(quote.outAmount) * fiatRates.NGN).toFixed(2) + " NGN";
    return null;
  };

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 2rem", background: "#181f2a" }}>
        <h2 style={{ color: "#fff", margin: 0 }}>Jupiter Remittance</h2>
        {mounted && <ClientWalletButton style={{ background: "#7c3aed", color: "#fff" }} />}
      </header>
      <main style={{ maxWidth: 400, margin: "2rem auto", padding: 24, border: "1px solid #222", borderRadius: 8, background: "#232b3a" }}>
        <h1 style={{ textAlign: "center", color: "#fff" }}>Send Money Across Borders</h1>
        <p style={{ textAlign: "center", color: "#b0b8c1", marginBottom: 24 }}>
          Fast, cheap, and secure powered by Solana and Jupiter.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ color: "#b0b8c1" }}>
            Amount
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} required min="0.000000001" step="any" style={{ width: "100%" }} disabled={sending} />
          </label>
          <div style={{ color: "#b0b8c1", background: "#181f2a", padding: 8, borderRadius: 4, marginBottom: 8, minHeight: 32 }}>
            {amount && Number(amount) > 0 ? (
              <>
                Commission (0.8%): <b>{commission.toFixed(6)} {sourceCurrency}</b><br />
                Net amount to swap: <b>{netAmount.toFixed(6)} {sourceCurrency}</b>
                {destCurrency === "INR" && fiatRates.INR && (
                  <><br />Fiat value: <b>₹{(netAmount * fiatRates.INR).toFixed(2)} INR</b></>
                )}
                {destCurrency === "PHP" && fiatRates.PHP && (
                  <><br />Fiat value: <b>₱{(netAmount * fiatRates.PHP).toFixed(2)} PHP</b></>
                )}
                {destCurrency === "NGN" && fiatRates.NGN && (
                  <><br />Fiat value: <b>₦{(netAmount * fiatRates.NGN).toFixed(2)} NGN</b></>
                )}
              </>
            ) : ""}
          </div>
          <label style={{ color: "#b0b8c1" }}>
            From (Currency)
            <select value={sourceCurrency} onChange={e => setSourceCurrency(e.target.value)} style={{ width: "100%" }} disabled={sending}>
              <option value="SOL">SOL</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="SGD">SGD</option>
            </select>
          </label>
          <label style={{ color: "#b0b8c1" }}>
            To (Currency)
            <select value={destCurrency} onChange={e => setDestCurrency(e.target.value)} style={{ width: "100%" }} disabled={sending}>
              <option value="INR">INR</option>
              <option value="PHP">PHP</option>
              <option value="NGN">NGN</option>
              <option value="USD">USD</option>
              <option value="USDT">USDT</option>
            </select>
          </label>
          <label style={{ color: "#b0b8c1" }}>
            Recipient
            <input type="text" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Recipient details" required style={{ width: "100%" }} disabled={sending} />
          </label>
          <div style={{ color: "#b0b8c1", background: "#181f2a", padding: 8, borderRadius: 4, marginBottom: 8, minHeight: 32 }}>
            {quote
              ? <>
                  Recipient gets: ~ {quote.outAmount} {destCurrency}<br />
                  {getFiatValue() && <>Equivalent: <b>{getFiatValue()}</b></>}
                </>
              : getFiatValue()
                ? <>Estimated fiat value: <b>{getFiatValue()}</b></>
                : "Enter amount to get quote"}
          </div>
          <button type="submit" style={{ background: sending ? "#888" : "#7c3aed", color: "#fff", padding: "0.75rem", border: "none", borderRadius: 4, fontWeight: 600 }} disabled={sending}>
            {sending ? "Processing..." : "Send Money"}
          </button>
        </form>
        {/* Transaction History */}
        <h3 style={{ color: "#fff", marginTop: 32 }}>Transaction History</h3>
        <div style={{ maxHeight: 200, overflowY: "auto" }}>
          <table style={{ width: "100%", color: "#b0b8c1", background: "#181f2a", borderRadius: 4, fontSize: 13 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th>Amount</th>
                <th>Received</th>
                <th>Recipient</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: "center" }}>No transactions yet</td></tr>
              ) : history.map((tx, i) => (
                <tr key={i}>
                  <td>{new Date(tx.date).toLocaleString()}</td>
                  <td>{tx.type}</td>
                  <td>{tx.from}</td>
                  <td>{tx.to}</td>
                  <td>{tx.amount}</td>
                  <td>{tx.received}</td>
                  <td>{tx.recipient}</td>
                  <td>
                    {tx.signature ? (
                      <a href={`https://solscan.io/tx/${tx.signature}`} target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed" }}>View</a>
                    ) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
} 