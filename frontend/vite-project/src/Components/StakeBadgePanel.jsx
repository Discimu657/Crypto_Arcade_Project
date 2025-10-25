import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import arcadeAbi from "../abi/ArcadeToken.json";
import stakeAbi from "../abi/StakeBadge.json";
// config should export ARCADE_TOKEN_ADDRESS and STAKE_BADGE_ADDRESS
import { ARCADE_TOKEN_ADDRESS, STAKE_BADGE_ADDRESS } from "../config";

import "./StakeBadgePanel.css";

export default function StakeBadgePanel() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);

  const [arcBalance, setArcBalance] = useState("0");
  const [stakeInfo, setStakeInfo] = useState({ amount: "0", startAt: 0, lockUntil: 0, rewardClaimed: false });
  const [preview, setPreview] = useState({ reward: "0", trophyId: 0 });
  const [isApproved, setIsApproved] = useState(false);

  const [amountInput, setAmountInput] = useState("");
  const [tier, setTier] = useState(1);
  const [loading, setLoading] = useState(false);

  const connectWallet = async () => {
    if (!window.ethereum) return alert("Install MetaMask");
    const prov = new ethers.BrowserProvider(window.ethereum);
    const s = await prov.getSigner();
    const addr = await s.getAddress();
    setProvider(prov);
    setSigner(s);
    setAccount(addr);
  };

  const arcade = useCallback(() => signer ? new ethers.Contract(ARCADE_TOKEN_ADDRESS, arcadeAbi, signer) : null, [signer]);
  const stake = useCallback(() => signer ? new ethers.Contract(STAKE_BADGE_ADDRESS, stakeAbi, signer) : null, [signer]);

  const refresh = useCallback(async () => {
    if (!signer || !account) return;
    try {
      const token = arcade();
      const garden = stake();

      const arcId = await token.ARCADE_COIN();
      const bal = await token.balanceOf(account, arcId);
      setArcBalance(ethers.formatUnits(bal, 18));

      const info = await garden.stakeInfo(account);
      setStakeInfo({
        amount: ethers.formatUnits(info[0], 18),
        startAt: Number(info[1].toString()),
        lockUntil: Number(info[2].toString()),
        rewardClaimed: info[3],
      });

      const previewRes = await garden.previewMatureReward(account);
      setPreview({
        reward: ethers.formatUnits(previewRes[0], 18),
        trophyId: Number(previewRes[1].toString()),
      });

      const appr = await token.isApprovedForAll(account, STAKE_BADGE_ADDRESS);
      setIsApproved(appr);
    } catch (e) {
      console.error("refresh err", e);
    }
  }, [signer, account, arcade, stake]);

  useEffect(() => {
    if (signer) {
      refresh();
      const id = setInterval(refresh, 5000);
      return () => clearInterval(id);
    }
  }, [signer, refresh]);

  const handleApprove = async () => {
    if (!signer) return;
    setLoading(true);
    try {
      const token = arcade();
      const tx = await token.setApprovalForAll(STAKE_BADGE_ADDRESS, true);
      await tx.wait();
      setIsApproved(true);
    } catch (e) {
      console.error(e);
      alert("Approve failed: " + (e?.reason || e?.message || ""));
    }
    setLoading(false);
  };

  const handleStake = async () => {
    if (!amountInput || parseFloat(amountInput) <= 0) return alert("Enter amount");
    setLoading(true);
    try {
      const garden = stake();
      const amt = ethers.parseUnits(amountInput, 18);
      const tx = await garden.stake(amt, tier);
      await tx.wait();
      setAmountInput("");
      await refresh();
    } catch (e) {
      console.error("stake err", e);
      alert("Stake failed: " + (e?.reason || e?.message || ""));
    }
    setLoading(false);
  };

  const handleHarvest = async () => {
    setLoading(true);
    try {
      const garden = stake();
      const tx = await garden.harvest();
      await tx.wait();
      await refresh();
    } catch (e) {
      console.error("harvest err", e);
      alert("Harvest failed: " + (e?.reason || e?.message || ""));
    }
    setLoading(false);
  };

  const handleWithdrawEarly = async () => {
    if (!confirm("Withdraw early will forfeit rewards and charge a fee. Continue?")) return;
    setLoading(true);
    try {
      const garden = stake();
      const tx = await garden.withdrawEarly();
      await tx.wait();
      await refresh();
    } catch (e) {
      console.error("withdraw err", e);
      alert("Withdraw failed: " + (e?.reason || e?.message || ""));
    }
    setLoading(false);
  };

  const handleWithdrawAfterHarvest = async () => {
    setLoading(true);
    try {
      const garden = stake();
      const tx = await garden.withdrawAfterHarvest();
      await tx.wait();
      await refresh();
    } catch (e) {
      console.error("withdraw after err", e);
      alert("Withdraw failed: " + (e?.reason || e?.message || ""));
    }
    setLoading(false);
  };

  const humanTime = (ts) => ts === 0 ? "-" : new Date(ts * 1000).toLocaleString();

  return (
    <div className="stake-panel">
      <h2>Stake & Badge</h2>
      {!account ? (
        <button onClick={connectWallet}>Connect Wallet</button>
      ) : (
        <>
          <div className="row">
            <strong>Account:</strong> <span>{account}</span>
          </div>

          <div className="row">
            <strong>ARC Balance:</strong> <span>{parseFloat(arcBalance).toFixed(6)}</span>
          </div>

          <div className="panel">
            <h3>Current Stake</h3>
            <p>Amount: <strong>{parseFloat(stakeInfo.amount).toFixed(6)} ARC</strong></p>
            <p>Start: <strong>{humanTime(stakeInfo.startAt)}</strong></p>
            <p>Lock Until: <strong>{humanTime(stakeInfo.lockUntil)}</strong></p>
            <p>Reward Claimed: <strong>{stakeInfo.rewardClaimed ? "Yes" : "No"}</strong></p>
            <p>Preview Mature Reward: <strong>{parseFloat(preview.reward).toFixed(6)} ARC</strong></p>
            <p>Trophy on maturity: <strong>{preview.trophyId}</strong></p>
          </div>

          <div className="panel">
            <h3>Stake (choose tier)</h3>
            <div className="tiers">
              <label><input type="radio" checked={tier===0} onChange={()=>setTier(0)} /> Short (2min / 5%)</label>
              <label><input type="radio" checked={tier===1} onChange={()=>setTier(1)} /> Medium (5min / 15%)</label>
              <label><input type="radio" checked={tier===2} onChange={()=>setTier(2)} /> Long (10min / 40%)</label>
            </div>

            <div className="stake-controls">
              <input type="number" placeholder="Amount ARC" value={amountInput} onChange={(e)=>setAmountInput(e.target.value)} />
              {!isApproved ? (
                <button onClick={handleApprove} disabled={loading}>Approve Contract</button>
              ) : (
                <button onClick={handleStake} disabled={loading || !amountInput}>Stake</button>
              )}
            </div>
          </div>

          <div className="panel">
            <h3>Actions</h3>
            <div className="actions-row">
              <button onClick={handleHarvest} disabled={loading || stakeInfo.amount==="0" || stakeInfo.rewardClaimed || (stakeInfo.lockUntil > Date.now()/1000)}>Harvest</button>
              <button onClick={handleWithdrawAfterHarvest} disabled={loading || stakeInfo.amount==="0" || !stakeInfo.rewardClaimed}>Withdraw (after harvest)</button>
              <button onClick={handleWithdrawEarly} disabled={loading || stakeInfo.amount==="0"}>Withdraw Early (forfeit reward)</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
