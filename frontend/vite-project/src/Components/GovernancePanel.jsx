// src/components/GovernancePanel.jsx
import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import "../styles/GovernancePanel.css";
import councilAbi from "../abi/ArcadeCouncil.json";
import arcadeAbi from "../abi/ArcadeToken.json";

export default function GovernancePanel({
  provider,
  signer,
  account,
  connectWallet,
  ARCADE_TOKEN_ADDRESS,
  ARCADE_COUNCIL_ADDRESS,
}) {
  const [council, setCouncil] = useState(null);
  const [arcade, setArcade] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [refreshToggle, setRefreshToggle] = useState(false);
  const [status, setStatus] = useState("");
  const [myVotingPower, setMyVotingPower] = useState("0");
  const [treasuryBalance, setTreasuryBalance] = useState("0");

  useEffect(() => {
    if (!signer) {
      setCouncil(null);
      setArcade(null);
      return;
    }
    setCouncil(new ethers.Contract(ARCADE_COUNCIL_ADDRESS, councilAbi, signer));
    setArcade(new ethers.Contract(ARCADE_TOKEN_ADDRESS, arcadeAbi, signer));
  }, [signer, ARCADE_COUNCIL_ADDRESS, ARCADE_TOKEN_ADDRESS]);

  const loadProposals = useCallback(async () => {
    if (!council || !arcade) return;
    try {
      const countBn = await council.getProposalCount();
      const count = Number(countBn.toString());
      const arr = [];
      for (let i = 1; i <= count; i++) {
        const p = await council.getProposal(i);
        // new contract returns 11 items:
        // [0] proposer
        // [1] description
        // [2] start (uint)
        // [3] end (uint)
        // [4] yes (uint)
        // [5] no (uint)
        // [6] tallied (bool)
        // [7] passed (bool)
        // [8] executed (bool)
        // [9] recipient (address)
        // [10] amount (uint)
        const proposer = p[0];
        const description = p[1];
        const start = Number(p[2]);
        const end = Number(p[3]);
        const yes = p[4].toString();
        const no = p[5].toString();
        const tallied = Boolean(p[6]);
        const passed = Boolean(p[7]);
        const executed = Boolean(p[8]);
        const recipient = p[9];
        const amountFormatted = ethers.formatUnits(p[10].toString(), 18);

        arr.push({
          id: i,
          proposer,
          description,
          start,
          end,
          yes,
          no,
          tallied,
          passed,
          executed,
          recipient,
          amountFormatted,
        });
      }
      setProposals(arr);

      // treasury balance (ARC id = 0)
      const arcId = await arcade.ARCADE_COIN();
      const bal = await arcade.balanceOf(ARCADE_COUNCIL_ADDRESS, arcId);
      setTreasuryBalance(ethers.formatUnits(bal.toString(), 18));
    } catch (err) {
      console.error("loadProposals err", err);
      setStatus("Error loading proposals");
    }
  }, [council, arcade, ARCADE_COUNCIL_ADDRESS]);

  useEffect(() => {
    loadProposals();
  }, [council, loadProposals, refreshToggle]);

  const refreshMyVotingPower = useCallback(async () => {
    if (!council || !account) {
      setMyVotingPower("0");
      return;
    }
    try {
      const vp = await council.votingPower(account);
      setMyVotingPower(vp.toString());
    } catch (err) {
      console.error("voting power err", err);
    }
  }, [council, account]);

  useEffect(() => {
    refreshMyVotingPower();
  }, [council, account, refreshToggle, refreshMyVotingPower]);

  // Create / Vote / Tally / Execute (same as before, safe error handling)
  const [createRecipient, setCreateRecipient] = useState("");
  const [createAmount, setCreateAmount] = useState("");
  const [createDuration, setCreateDuration] = useState("120");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreateProposal = async () => {
    if (!council || !signer) return alert("Connect wallet first");
    if (!ethers.isAddress(createRecipient)) return alert("Enter valid recipient address");
    if (!createAmount || Number(createAmount) <= 0) return alert("Enter amount > 0");
    if (!createDuration || Number(createDuration) < 60) return alert("Duration should be at least 60s");
    if (!createDescription || createDescription.trim().length < 3) return alert("Short description required");

    setCreating(true);
    setStatus("Creating proposal - confirm in wallet...");
    try {
      const amountWei = ethers.parseUnits(String(createAmount), 18);
      const tx = await council.createPayoutProposal(createRecipient, amountWei, createDescription, Number(createDuration));
      await tx.wait();
      setStatus("Proposal created.");
      setCreateRecipient("");
      setCreateAmount("");
      setCreateDuration("120");
      setCreateDescription("");
      setRefreshToggle((t) => !t);
    } catch (err) {
      console.error("create err", err);
      setStatus("Create failed: " + (err?.reason || err?.message || err));
    } finally {
      setCreating(false);
    }
  };

  const handleVote = async (id, support) => {
    if (!council || !signer) return alert("Connect wallet first");
    try {
      setStatus("Sending vote tx - confirm in wallet...");
      const tx = await council.vote(id, support);
      await tx.wait();
      setStatus("Vote recorded.");
      setRefreshToggle((t) => !t);
    } catch (err) {
      console.error("vote err", err);
      setStatus("Vote failed: " + (err?.reason || err?.message || err));
    }
  };

  const handleTally = async (id) => {
    if (!council || !signer) return alert("Connect wallet first");
    try {
      setStatus("Tallying proposal...");
      const tx = await council.tally(id);
      await tx.wait();
      setStatus("Tally complete.");
      setRefreshToggle((t) => !t);
    } catch (err) {
      console.error("tally err", err);
      setStatus("Tally failed: " + (err?.reason || err?.message || err));
    }
  };

  const handleExecute = async (id) => {
    if (!council || !signer) return alert("Connect wallet first");
    try {
      setStatus("Executing payout (if passed)...");
      const tx = await council.executePayout(id);
      await tx.wait();
      setStatus("Execute called; check event for success.");
      setRefreshToggle((t) => !t);
    } catch (err) {
      console.error("execute err", err);
      // show revert reason if present
      let msg = "Execute failed";
      if (err?.reason) msg = err.reason;
      else if (err?.data) msg = String(err.data).slice(0, 200);
      setStatus(msg);
    }
  };

  const timeLeft = (end) => {
    const now = Math.floor(Date.now() / 1000);
    if (now >= end) return "Ended";
    const diff = end - now;
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="gov-root">
      <div className="gov-header">
        <button className="back-btn" onClick={() => (window.location.href = "/")}>← Back</button>
        <h2>Arcade Council — Governance</h2>
        <div className="wallet-compact">
          {!account ? (
            <button className="connect" onClick={connectWallet}>Connect Wallet</button>
          ) : (
            <div className="acct">{account.substring(0,6)}...{account.substring(account.length-4)}</div>
          )}
        </div>
      </div>

      <div className="gov-grid">
        <div className="panel create-panel">
          <h3>Create Treasury Payout Proposal</h3>
          <label>Recipient address</label>
          <input value={createRecipient} onChange={(e)=>setCreateRecipient(e.target.value)} placeholder="0x..." />

          <label>Amount (ARC)</label>
          <input value={createAmount} onChange={(e)=>setCreateAmount(e.target.value)} placeholder="e.g. 5" />

          <label>Voting duration (seconds)</label>
          <input value={createDuration} onChange={(e)=>setCreateDuration(e.target.value)} />

          <label>Short description</label>
          <input value={createDescription} onChange={(e)=>setCreateDescription(e.target.value)} placeholder="Why this payout?" />

          <div className="create-actions">
            <button className="primary" onClick={handleCreateProposal} disabled={creating || !account}>
              {creating ? "Creating..." : "Create Proposal"}
            </button>
            <button onClick={() => { setCreateRecipient(""); setCreateAmount(""); setCreateDuration("120"); setCreateDescription(""); }}>Reset</button>
          </div>

          <div className="muted-block">
            <div>Your voting power: <strong>{myVotingPower}</strong> votes</div>
            <div className="note">Voting power is computed from your badge balances (badge NFTs).</div>
            <div className="muted">Treasury ARC: <strong>{treasuryBalance}</strong></div>
          </div>

          <div className="status">{status}</div>
        </div>

        <div className="panel list-panel">
          <div className="list-panel-header">
            <h3>Active Proposals</h3>
            <div className="controls">
              <button onClick={() => setRefreshToggle(t => !t)}>Refresh</button>
              <button onClick={() => { setStatus(""); setRefreshToggle(t => !t); }}>Clear status</button>
            </div>
          </div>

          {proposals.length === 0 ? (
            <p className="muted">No proposals yet.</p>
          ) : (
            proposals.slice().reverse().map((p) => (
              <div className="proposal-card" key={p.id}>
                <div className="proposal-top">
                  <div className="proposal-id">#{p.id}</div>
                  <div className="proposal-desc">{p.description}</div>
                </div>

                <div className="proposal-body">
                  <div>Proposer: {p.proposer === account ? "You" : `${p.proposer.substring(0,6)}...${p.proposer.slice(-4)}`}</div>
                  <div>Recipient: {p.recipient}</div>
                  <div>Amount: <strong>{p.amountFormatted} ARC</strong></div>
                  <div>Voting: {timeLeft(p.end)}</div>
                  <div>Yes: {p.yes} — No: {p.no}</div>
                  <div>Tallied: {p.tallied ? "Yes" : "No"} · Passed: {p.passed ? "Yes" : "No"} · Executed: {p.executed ? "Yes" : "No"}</div>
                </div>

                <div className="proposal-actions">
                  <button onClick={() => handleVote(p.id, true)} disabled={!account}>Vote Yes</button>
                  <button onClick={() => handleVote(p.id, false)} disabled={!account}>Vote No</button>
                  <button onClick={() => handleTally(p.id)} disabled={!account}>Tally</button>
                  <button onClick={() => handleExecute(p.id)} disabled={!account}>Execute</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="gov-help">
        <h4>How to use DAO (quick)</h4>
        <ol>
          <li>Ensure Council contract has ARC tokens (mint/transfer to Council address).</li>
          <li>Create a short proposal (recipient = your address, amount = 1 ARC, duration = 120s).</li>
          <li>Voters (badge holders) click Vote Yes/No.</li>
          <li>After voting period ends, click Tally and then Execute if passed.</li>
        </ol>
      </div>
    </div>
  );
}
