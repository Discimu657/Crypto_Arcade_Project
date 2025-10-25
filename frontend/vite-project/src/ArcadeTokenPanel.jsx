import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import "./App.css";


import arcadeTokenAbi from "./abi/ArcadeToken.json"

export default function ArcadeTokenPanel({ arcadeTokenAddress }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [arcBalance, setArcBalance] = useState("0");
  const [isApproved, setIsApproved] = useState(false);
  const [mintAmount, setMintAmount] = useState("100"); // default 100 ARC
  const [trophyId, setTrophyId] = useState("1");
  const [targetGrant, setTargetGrant] = useState("");
  const [status, setStatus] = useState("");

  // provider + signer
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Install MetaMask");
      return;
    }
    const prov = new ethers.BrowserProvider(window.ethereum);
    const s = await prov.getSigner();
    try {
      const addr = await s.getAddress();
      setProvider(prov);
      setSigner(s);
      setAccount(addr);
    } catch (e) {
      console.error("connect error", e);
    }
  };

  const tokenContract = useCallback(() => {
    if (!signer || !arcadeTokenAddress) return null;
    return new ethers.Contract(arcadeTokenAddress, arcadeTokenAbi, signer);
  }, [signer, arcadeTokenAddress]);

  const refresh = useCallback(async () => {
    if (!signer || !account) return;
    try {
      const c = tokenContract();
      const id = await c.ARCADE_COIN();
      const bal = await c.balanceOf(account, id);
      setArcBalance(ethers.formatUnits(bal, 18));

      const appr = await c.isApprovedForAll(account, arcadeTokenAddress);
      setIsApproved(appr);
    } catch (e) {
      console.error("refresh token", e);
    }
  }, [signer, account, arcadeTokenAddress, tokenContract]);

  useEffect(() => {
    if (signer) {
      refresh();
      const id = setInterval(refresh, 5000);
      return () => clearInterval(id);
    }
  }, [signer, refresh]);

  // Approve operator (useful for demos - granting approval to a game contract)
  const handleSetApproval = async (operatorAddress) => {
    if (!signer) return;
    try {
      setStatus("Approving...");
      const c = tokenContract();
      const tx = await c.setApprovalForAll(operatorAddress, true);
      await tx.wait();
      setStatus("Approved");
      await refresh();
    } catch (e) {
      console.error(e);
      setStatus("Approval failed");
    }
  };

  // Admin: mint ARC to address (requires MINTER_ROLE)
  const handleMint = async (to) => {
    if (!signer) return;
    try {
      setStatus("Minting...");
      const c = tokenContract();
      const amt = ethers.parseUnits(mintAmount || "0", 18);
      const tx = await c.mintReward(to, amt);
      await tx.wait();
      setStatus("Mint success");
      await refresh();
    } catch (e) {
      console.error(e);
      setStatus("Mint failed: " + (e?.reason || e?.message || ""));
    }
  };

  // Admin: award trophy (NFT id)
  const handleAwardTrophy = async (to) => {
    if (!signer) return;
    try {
      setStatus("Awarding trophy...");
      const c = tokenContract();
      const id = parseInt(trophyId || "1");
      const tx = await c.awardTrophy(to, id);
      await tx.wait();
      setStatus("Awarded trophy id " + id);
      await refresh();
    } catch (e) {
      console.error(e);
      setStatus("Award failed: " + (e?.reason || e?.message || ""));
    }
  };

  // Admin: grant MINTER_ROLE to game contract
  const handleGrantMinter = async () => {
    if (!signer) return;
    try {
      setStatus("Granting MINTER_ROLE...");
      const c = tokenContract();
      const role = await c.MINTER_ROLE();
      const tx = await c.grantRole(role, targetGrant);
      await tx.wait();
      setStatus("Granted MINTER_ROLE to " + targetGrant);
    } catch (e) {
      console.error(e);
      setStatus("Grant failed: " + (e?.reason || e?.message || ""));
    }
  };

  return (
    <div className="arcade-panel">
      <h2>ArcadeToken (ARC)</h2>
      {!account ? (
        <button onClick={connectWallet}>Connect MetaMask</button>
      ) : (
        <>
          <div className="row">
            <strong>Account:</strong> <span>{account}</span>
          </div>

          <div className="row">
            <strong>ARC Balance (id 0):</strong> <span>{parseFloat(arcBalance).toFixed(6)}</span>
          </div>

          <div className="controls">
            <div className="control">
              <label>Mint amount (ARC)</label>
              <input value={mintAmount} onChange={(e) => setMintAmount(e.target.value)} />
              <button onClick={() => handleMint(account)}>Mint to me</button>
            </div>

            <div className="control">
              <label>Trophy ID to award</label>
              <input value={trophyId} onChange={(e) => setTrophyId(e.target.value)} />
              <button onClick={() => handleAwardTrophy(account)}>Award trophy to me</button>
            </div>

            <div className="control">
              <label>Grant MINTER_ROLE to (address)</label>
              <input value={targetGrant} onChange={(e) => setTargetGrant(e.target.value)} placeholder="0x..." />
              <button onClick={handleGrantMinter}>Grant MINTER_ROLE</button>
            </div>

            <div className="control">
              <label>Approve operator (e.g., game address)</label>
              <input placeholder="operator address" id="operator" />
              <button onClick={() => {
                const op = document.getElementById("operator").value;
                handleSetApproval(op);
              }}>Approve operator</button>
            </div>
          </div>

          <div className="status"><em>{status}</em></div>
        </>
      )}
    </div>
  );
}
