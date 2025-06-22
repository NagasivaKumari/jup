"use client";
import { useState } from "react";

export default function Home() {
  const [amount, setAmount] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState("USD");
  const [destCurrency, setDestCurrency] = useState("PHP");
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    setStatus("Processing transaction (mock)...");
    setTimeout(() => setStatus("Transaction complete! (mock)"), 2000);
  };

  return (
    <main style={{ maxWidth: 400, margin: "2rem auto", padding: 24, border: "1px solid #eee", borderRadius: 8 }}>
      <h1>International Remittance App</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Amount
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} required min="0.01" step="0.01" />
        </label>
        <label>
          From (Currency)
          <select value={sourceCurrency} onChange={e => setSourceCurrency(e.target.value)}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="SGD">SGD</option>
          </select>
        </label>
        <label>
          To (Currency)
          <select value={destCurrency} onChange={e => setDestCurrency(e.target.value)}>
            <option value="PHP">PHP</option>
            <option value="INR">INR</option>
            <option value="NGN">NGN</option>
          </select>
        </label>
        <label>
          Recipient
          <input type="text" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Recipient details" required />
        </label>
        <button type="submit">Send Money</button>
      </form>
      {status && <p style={{ marginTop: 16 }}>{status}</p>}
    </main>
  );
} 