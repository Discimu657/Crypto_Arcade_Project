// src/components/LootBoxPanel.jsx
import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import "../styles/LootBox.css";
import lootboxAbi from "../abi/LootBox.json";
import arcadeAbi from "../abi/ArcadeToken.json";
import { ARCADE_TOKEN_ADDRESS as DEFAULT_ARCADE_TOKEN_ADDRESS, LOOTBOX_ADDRESS as DEFAULT_LOOTBOX_ADDRESS } from "../config";

export default function LootBoxPanel({
  provider,
  signer,
  account,
  connectWallet,
  ARCADE_TOKEN_ADDRESS = DEFAULT_ARCADE_TOKEN_ADDRESS,
  LOOTBOX_ADDRESS = DEFAULT_LOOTBOX_ADDRESS,
}) {
  const [lootbox, setLootbox] = useState(null);
  const [arcade, setArcade] = useState(null);

  const [priceHuman, setPriceHuman] = useState("0");
  const [priceWei, setPriceWei] = useState("0");
  const [boxCount, setBoxCount] = useState(1);
  const [isApproved, setIsApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [recentWins, setRecentWins] = useState([]);
  const [rewardsList, setRewardsList] = useState([]);

  useEffect(() => {
    if (!signer) {
      setLootbox(null);
      setArcade(null);
      return;
    }
    setLootbox(new ethers.Contract(LOOTBOX_ADDRESS, lootboxAbi, signer));
    setArcade(new ethers.Contract(ARCADE_TOKEN_ADDRESS, arcadeAbi, signer));
  }, [signer, LOOTBOX_ADDRESS, ARCADE_TOKEN_ADDRESS]);

  const refreshConfig = useCallback(async () => {
    if (!lootbox || !arcade) return;
    try {
      // price
      const price = await lootbox.pricePerBox();
      setPriceWei(price.toString());
      setPriceHuman(ethers.formatUnits(price.toString(), 18));

      // rewards list
      const cnt = await lootbox.rewardsCount();
      const arr = [];
      for (let i = 0; i < Number(cnt.toString()); i++) {
        const r = await lootbox.rewardAt(i);
        arr.push({ trophyId: r[0].toString(), weight: r[1].toString() });
      }
      setRewardsList(arr);
    } catch (err) {
      console.error("refreshConfig", err);
    }
  }, [lootbox, arcade]);

  useEffect(() => {
    refreshConfig();
  }, [lootbox, refreshConfig]);

  // approval check
  const checkApproval = useCallback(async () => {
    if (!arcade || !account) return setIsApproved(false);
    try {
      const approved = await arcade.isApprovedForAll(account, LOOTBOX_ADDRESS);
      setIsApproved(Boolean(approved));
    } catch (err) {
      console.error("checkApproval err", err);
    }
  }, [arcade, account, LOOTBOX_ADDRESS]);

  useEffect(() => {
    checkApproval();
  }, [arcade, account, LOOTBOX_ADDRESS]);

  // event listener for BoxOpened to show recent wins
  useEffect(() => {
    if (!lootbox) return;
    const onOpened = (user, trophyId, timestamp, boxCount) => {
      setRecentWins((s) => [{ user, trophyId: trophyId.toString(), timestamp: Number(timestamp.toString()), boxCount: Number(boxCount.toString()) }, ...s].slice(0, 20));
    };
    lootbox.on && lootbox.on("BoxOpened", onOpened);
    return () => {
      lootbox.off && lootbox.off("BoxOpened", onOpened);
    };
  }, [lootbox]);

  // approve arcade token for lootbox
  const approve = async () => {
    if (!arcade || !signer) return alert("Connect wallet");
    setLoading(true);
    try {
      const tx = await arcade.setApprovalForAll(LOOTBOX_ADDRESS, true);
      await tx.wait();
      setIsApproved(true);
      setStatus("Approved");
    } catch (err) {
      console.error("approve err", err);
      setStatus("Approve failed");
    } finally {
      setLoading(false);
    }
  };

  // buy boxes
  const buyBoxes = async () => {
    if (!lootbox || !arcade || !signer) return alert("Connect wallet");
    if (!isApproved) return alert("Please approve LootBox to spend your ARC first");
    if (boxCount <= 0) return alert("box count must be > 0");
    setLoading(true);
    try {
      const tx = await lootbox.openBoxes(boxCount);
      setStatus("Confirm transaction in wallet...");
      const receipt = await tx.wait();
      setStatus("Opened boxes! Check your trophies.");
      // optionally parse logs or show event-based UI - events are added to recentWins by listener
    } catch (err) {
      console.error("buy err", err);
      setStatus("Buy failed: " + (err?.reason || err?.message || ""));
    } finally {
      setLoading(false);
    }
  };

  // UI: format
  const totalPriceHuman = () => {
    try {
      return (Number(priceHuman) * Number(boxCount)).toString();
    } catch {
      return "0";
    }
  };

  return (
    <div className="loot-root">
      <div className="loot-header">
        <button className="back-btn" onClick={() => (window.location.href = "/")}>← Back</button>
        <h2>LootBox — Open Mystery Boxes</h2>
        <div className="wallet-compact">
          {!account ? <button onClick={connectWallet}>Connect Wallet</button> : <div className="acct">{account.substring(0,6)}...{account.substring(account.length-4)}</div>}
        </div>
      </div>

      <div className="loot-grid">
        <div className="panel buy-panel">
          <h3>Buy & Open Boxes</h3>
          <div className="price-row">
            <div>Price / box: <strong>{priceHuman} ARC</strong></div>
            <div>Total: <strong>{totalPriceHuman()} ARC</strong></div>
          </div>

          <label>Boxes to open</label>
          <input type="number" min="1" max="20" value={boxCount} onChange={(e) => setBoxCount(Number(e.target.value))} />

          <div className="approve-row">
            {!isApproved ? (
              <button onClick={approve} disabled={loading}>Approve ARC</button>
            ) : (
              <div className="approved-tag">Marketplace Approved ✓</div>
            )}
          </div>

          <div className="actions">
            <button className="primary" onClick={buyBoxes} disabled={!isApproved || loading}>
              {loading ? "Processing..." : `Open ${boxCount} box${boxCount>1 ? 'es' : ''}`}
            </button>
          </div>

          <div className="status">{status}</div>
        </div>

        <div className="panel rewards-panel">
          <h3>Possible Rewards</h3>
          <div className="rewards-list">
            {rewardsList.length === 0 ? <p className="muted">No rewards configured — admin must add rewards.</p> :
              rewardsList.map((r, i) => (
                <div className="reward-row" key={i}>
                  <div>Trophy ID: <strong>{r.trophyId}</strong></div>
                  <div>Weight: <strong>{r.weight}</strong></div>
                </div>
              ))
            }
          </div>

          <h4>Recent Wins</h4>
          <div className="recent">
            {recentWins.length === 0 ? <p className="muted">No activity yet.</p> : recentWins.map((w, i) => (
              <div key={i} className="recent-row">
                <div>{w.user === account ? "You" : `${w.user.substring(0,6)}...${w.user.slice(-4)}`}</div>
                <div>won trophy #{w.trophyId}</div>
                <div className="time">{new Date(w.timestamp * 1000).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="help">
        <h4>How LootBox works</h4>
        <ol>
          <li>Connect wallet and approve LootBox to spend your ARC (only once).</li>
          <li>Choose how many boxes to open and click Open. You will pay price × count in ARC.</li>
          <li>Each box randomly mints a trophy NFT (ids configured by admin).</li>
          <li>LootBox must have MINTER_ROLE on ArcadeToken so it can mint trophies.</li>
        </ol>
      </div>
    </div>
  );
}
