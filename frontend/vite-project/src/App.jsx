// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import "./App.css";

import StakeBadgePanel from "./components/StakeBadgePanel";
import MarketPanel from "./components/MarketPanel";
import GovernancePanel from "./components/GovernancePanel";
import LootBoxPanel from "./components/LootBoxPanel";

import arcadeTokenAbi from "./abi/ArcadeToken.json";
import lootboxAbi from "./abi/LootBox.json";
import stakeBadgeAbi from "./abi/StakeBadge.json";
import tradehubAbi from "./abi/TradeHub.json";
import councilAbi from "./abi/ArcadeCouncil.json";

import * as CONFIG from "./config";

const ARCADE_TOKEN_ADDRESS = CONFIG.ARCADE_TOKEN_ADDRESS;
const STAKE_BADGE_ADDRESS = CONFIG.STAKE_BADGE_ADDRESS;
const TRADEHUB_ADDRESS = CONFIG.TRADEHUB_ADDRESS;
const ARCADE_REGISTRY_ADDRESS = CONFIG.ARCADE_REGISTRY_ADDRESS;
const ARCADE_COUNCIL_ADDRESS = CONFIG.ARCADE_COUNCIL_ADDRESS;
const LOOTBOX_ADDRESS = CONFIG.LOOTBOX_ADDRESS;
const DEPLOY_BLOCK = CONFIG.DEPLOY_BLOCK; // may be undefined — code handles that

/* ---------- Wallet hook ---------- */
function useWallet() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [network, setNetwork] = useState(null);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const s = await prov.getSigner();
      const addr = await s.getAddress();
      const net = await prov.getNetwork();
      setProvider(prov);
      setSigner(s);
      setAccount(addr);
      setNetwork(net);
    } catch (err) {
      console.error("connectWallet error", err);
      alert("Could not connect wallet: " + (err?.message || err));
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setNetwork(null);
  }, []);

  return { provider, signer, account, network, connectWallet, disconnect };
}

/* ---------- Small UI helper ---------- */
function StatBox({ title, value }) {
  return (
    <div className="stat">
      <div className="stat-title">{title}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

/* ---------- Home (dashboard) ---------- */
function Home({ connectWallet, disconnect, account, network, provider }) {
  const MODULES = [
    { key: "stake", title: "Stake & Badge", addr: STAKE_BADGE_ADDRESS, abi: stakeBadgeAbi },
    { key: "loot", title: "LootBox", addr: LOOTBOX_ADDRESS, abi: lootboxAbi },
    { key: "market", title: "TradeHub", addr: TRADEHUB_ADDRESS, abi: tradehubAbi },
    { key: "dao", title: "Arcade Council", addr: ARCADE_COUNCIL_ADDRESS, abi: councilAbi },
  ];

  const [tvl, setTvl] = useState("—");
  const [moduleTvls, setModuleTvls] = useState({});
  const [totalMinted, setTotalMinted] = useState("—");
  const [activePlayers, setActivePlayers] = useState("—");
  const [leaderboard, setLeaderboard] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [govNext, setGovNext] = useState("No active proposals");

  const navigate = useNavigate();

  const openModule = (key) => {
    switch (key) {
      case "stake": return navigate("/stake");
      case "market": return navigate("/market");
      case "dao": return navigate("/dao");
      case "governance": return navigate("/dao");
      case "loot": return navigate("/loot");
      default: return navigate("/");
    }
  };

  const shortAddr = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "0x0");
  const ZERO = "0x0000000000000000000000000000000000000000";

  // --- refresh TVL (unchanged) ---
  const refreshTVL = useCallback(async () => {
    if (!provider) return;
    try {
      const token = new ethers.Contract(ARCADE_TOKEN_ADDRESS, arcadeTokenAbi, provider);
      const arcIdBn = await token.ARCADE_COIN();
      const arcId = arcIdBn.toString();

      let sum = BigInt(0);
      const perModule = {};
      for (const m of MODULES) {
        if (!m.addr) { perModule[m.key] = BigInt(0); continue; }
        try {
          const balBn = await token.balanceOf(m.addr, arcId);
          const bal = BigInt(balBn.toString());
          perModule[m.key] = bal;
          sum += bal;
        } catch (err) {
          console.warn("balanceOf failed for", m.addr, err);
          perModule[m.key] = BigInt(0);
        }
      }

      const humanSum = Number(ethers.formatUnits(sum.toString(), 18));
      setTvl(humanSum.toLocaleString(undefined, { maximumFractionDigits: 4 }));

      const breaks = {};
      for (const k of Object.keys(perModule)) {
        breaks[k] = Number(ethers.formatUnits(perModule[k].toString(), 18)).toLocaleString(undefined, { maximumFractionDigits: 4 });
      }
      setModuleTvls(breaks);

      // total minted scanning (fallback behavior if DEPLOY_BLOCK missing)
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = typeof DEPLOY_BLOCK === "number" ? DEPLOY_BLOCK : Math.max(0, currentBlock - 100000);
      const filter = token.filters.TransferSingle ? token.filters.TransferSingle() : null;
      if (filter) {
        const events = await token.queryFilter(filter, fromBlock, currentBlock);
        let minted = BigInt(0);
        for (const ev of events) {
          const from = ev.args?.[1];
          const id = ev.args?.[3];
          const value = ev.args?.[4];
          if (!from) continue;
          if (from.toLowerCase() === ZERO && id.toString() === arcId) {
            minted += BigInt(value.toString());
          }
        }
        setTotalMinted(Number(ethers.formatUnits(minted.toString(), 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }));
      } else {
        setTotalMinted("—");
      }
    } catch (err) {
      console.error("refreshTVL err", err);
    }
  }, [provider]);

  // --- refresh Activity & Leaderboard (IMPROVED) ---
  const refreshActivity = useCallback(async () => {
    if (!provider) return;
    try {
      const blockNow = await provider.getBlockNumber();
      const fromBlock = Math.max(0, blockNow - 5000);
      const activities = [];
      const scores = {};

      // LootBox events
      if (LOOTBOX_ADDRESS) {
        try {
          const lb = new ethers.Contract(LOOTBOX_ADDRESS, lootboxAbi, provider);
          const filter = lb.filters.BoxOpened ? lb.filters.BoxOpened() : null;
          if (filter) {
            const evs = await lb.queryFilter(filter, fromBlock, blockNow);
            for (const e of evs.reverse()) {
              const user = e.args?.[0];
              if (!user) continue;
              const actor = String(user).toLowerCase();
              const trophyId = e.args?.[1]?.toString();
              const ts = Number(e.args?.[2]?.toString?.()) || (e.blockNumber ? (await provider.getBlock(e.blockNumber)).timestamp : Math.floor(Date.now()/1000));
              const boxCount = Number(e.args?.[3]?.toString?.() || 1);
              const display = (account && actor === account.toLowerCase()) ? "You" : shortAddr(actor);
              activities.push({
                actor,
                display,
                text: `${display} opened ${boxCount} LootBox(es) and won trophy #${trophyId}`,
                txHash: e.transactionHash,
                time: ts,
              });
              scores[actor] = (scores[actor] || 0) + boxCount;
            }
          }
        } catch (err) {
          console.warn("lootbox events skipped", err);
        }
      }

      // StakeBadge events
      if (STAKE_BADGE_ADDRESS) {
        try {
          const sb = new ethers.Contract(STAKE_BADGE_ADDRESS, stakeBadgeAbi, provider);
          const stFilter = sb.filters.Staked ? sb.filters.Staked() : null;
          if (stFilter) {
            const evs = await sb.queryFilter(stFilter, fromBlock, blockNow);
            for (const e of evs.reverse()) {
              const user = e.args?.[0];
              if (!user) continue;
              const actor = String(user).toLowerCase();
              const amount = e.args?.[1] ? Number(ethers.formatUnits(e.args[1].toString(), 18)) : 0;
              const display = (account && actor === account.toLowerCase()) ? "You" : shortAddr(actor);
              const time = Number((await provider.getBlock(e.blockNumber)).timestamp);
              activities.push({
                actor,
                display,
                text: `${display} staked ${amount} ARC`,
                txHash: e.transactionHash,
                time,
              });
              scores[actor] = (scores[actor] || 0) + amount * 0.1;
            }
          }
          const hFilter = sb.filters.Harvested ? sb.filters.Harvested() : null;
          if (hFilter) {
            const evs = await sb.queryFilter(hFilter, fromBlock, blockNow);
            for (const e of evs.reverse()) {
              const user = e.args?.[0];
              if (!user) continue;
              const actor = String(user).toLowerCase();
              const amount = e.args?.[1] ? Number(ethers.formatUnits(e.args[1].toString(), 18)) : 0;
              const display = (account && actor === account.toLowerCase()) ? "You" : shortAddr(actor);
              const time = Number((await provider.getBlock(e.blockNumber)).timestamp);
              activities.push({
                actor,
                display,
                text: `${display} harvested ${amount} ARC`,
                txHash: e.transactionHash,
                time,
              });
              scores[actor] = (scores[actor] || 0) + amount;
            }
          }
        } catch (err) {
          console.warn("stake events skipped", err);
        }
      }

      // TradeHub ListingSold (optional)
      if (TRADEHUB_ADDRESS) {
        try {
          const th = new ethers.Contract(TRADEHUB_ADDRESS, tradehubAbi, provider);
          const soldFilter = th.filters.ListingSold ? th.filters.ListingSold() : null;
          if (soldFilter) {
            const evs = await th.queryFilter(soldFilter, fromBlock, blockNow);
            for (const e of evs.reverse()) {
              const buyer = e.args?.[0];
              if (!buyer) continue;
              const actor = String(buyer).toLowerCase();
              const price = e.args?.[3] ? Number(ethers.formatUnits(e.args[3].toString(), 18)) : 0;
              const display = (account && actor === account.toLowerCase()) ? "You" : shortAddr(actor);
              const time = Number((await provider.getBlock(e.blockNumber)).timestamp);
              activities.push({
                actor,
                display,
                text: `${display} bought item for ${price} ARC`,
                txHash: e.transactionHash,
                time,
              });
              scores[actor] = (scores[actor] || 0) + price;
            }
          }
        } catch (err) {
          console.warn("tradehub events skipped", err);
        }
      }

      // Build leaderboard and recent lists
      const board = Object.entries(scores).map(([addr, score]) => ({ addr, score })).sort((a, b) => b.score - a.score).slice(0, 10);
      const recent = activities.sort((a, b) => b.time - a.time).slice(0, 20).map(a => ({ ...a, prettyTime: new Date(a.time * 1000).toLocaleString() }));
      setLeaderboard(board);
      setRecentActivity(recent);

      // compute unique active players from canonical actor addresses
      const uniqActors = new Set(recent.map(a => (a.actor || "").toLowerCase()).filter(x => x && x !== "unknown"));
      setActivePlayers(String(uniqActors.size));
    } catch (err) {
      console.error("refreshActivity err", err);
    }
  }, [provider, account]);

  // Governance summary unchanged...
  const refreshGovernanceSummary = useCallback(async () => {
    if (!provider || !ARCADE_COUNCIL_ADDRESS) { setGovNext("No active proposals"); return; }
    try {
      const council = new ethers.Contract(ARCADE_COUNCIL_ADDRESS, councilAbi, provider);
      const countBn = await council.getProposalCount();
      const count = Number(countBn.toString());
      const now = Math.floor(Date.now() / 1000);
      let nextId = null;
      let nextEnd = Infinity;
      for (let i = 1; i <= count; i++) {
        const p = await council.getProposal(i);
        const end = Number(p[3].toString());
        const tallied = Boolean(p[6]);
        if (end > now && end < nextEnd && !tallied) {
          nextEnd = end;
          nextId = i;
        }
      }
      if (!nextId) { setGovNext("No active proposals"); return; }
      const diff = nextEnd - now;
      const days = Math.floor(diff / 86400);
      const hours = Math.floor((diff % 86400) / 3600);
      const mins = Math.floor((diff % 3600) / 60);
      const label = `${days > 0 ? `${days}d ` : ""}${hours}h ${mins}m`;
      setGovNext(`Next vote: Proposal #${nextId} closes in ${label}`);
    } catch (err) {
      console.warn("refreshGovernanceSummary err", err);
      setGovNext("No active proposals");
    }
  }, [provider]);

  // initial load & polling
  useEffect(() => {
    refreshTVL();
    refreshActivity();
    refreshGovernanceSummary();
    const t1 = setInterval(refreshTVL, 15000);
    const t2 = setInterval(refreshActivity, 30000);
    const t3 = setInterval(refreshGovernanceSummary, 15000);
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3); };
  }, [provider, refreshTVL, refreshActivity, refreshGovernanceSummary]);

  return (
    <div className="dapp">
      <header className="dapp-header">
        <div className="brand">
          <div className="logo">🎮</div>
          <div><h1>Crypto Quest Arcade</h1><p className="tag">Play • Learn • Govern</p></div>
        </div>

        <div className="header-right">
          {account ? (
            <div className="wallet">
              <div className="net">{network?.name || "network"}</div>
              <div className="acct">{account.substring(0, 6)}...{account.substring(account.length - 4)}</div>
              <button className="disconnect" onClick={disconnect}>Disconnect</button>
            </div>
          ) : (
            <button className="connect" onClick={connectWallet}>Connect Wallet</button>
          )}
        </div>
      </header>

      <main className="main-grid">
        <section className="left-column">
          <div className="overview">
            <div className="overview-left">
              <StatBox title="TVL (ARC)" value={tvl} />
              <StatBox title="Total ARC Minted" value={totalMinted} />
              <StatBox title="Active Players" value={activePlayers} />
            </div>
            <div className="overview-right">
              <h3>Quick Actions</h3>
              <div className="quick-actions">
                <button onClick={() => openModule("stake")}>Play Stake & Badge</button>
                <button onClick={() => openModule("loot")}>Open LootBox</button>
                <button onClick={() => openModule("market")}>Visit Marketplace</button>
              </div>
            </div>
          </div>

          <div className="modules">
            <h2>Arcade Modules</h2>
            <div className="module-grid">
              {MODULES.map(m => (
                <div key={m.key} className="module-card">
                  <div className="module-card-top">
                    <div className="module-title">{m.title}</div>
                    <div className="tag-small live">Live</div>
                  </div>
                  <div className="module-desc">{m.key === "loot" ? "Buy mystery boxes for a chance to win rare badges and ARC." : "Explore module"}</div>
                  <div className="module-meta"><div>TVL: <strong>{moduleTvls[m.key] || "0"}</strong></div><div>APY: <strong>—</strong></div></div>
                  <div className="module-actions">
                    <button onClick={() => openModule(m.key)}>Play / Explore</button>
                    <button className="ghost" onClick={() => window.alert("Learn: " + m.title)}>Learn</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="right-column">
          <div className="panel">
            <h3>Leaderboard</h3>
            {leaderboard.length === 0 ? <p className="muted">No leaderboard data yet.</p> :
              <ol className="leaderboard">{leaderboard.map((p) => (<li key={p.addr}><span className="handle">{shortAddr(p.addr)}</span> <span className="score">+{Number(p.score).toFixed(3)} pts</span></li>))}</ol>}
          </div>

          <div className="panel">
            <h3>Recent Activity</h3>
            {recentActivity.length === 0 ? <p className="muted">No recent activity.</p> :
              <ul className="activity">{recentActivity.map((a, idx) => (<li key={idx}>{a.text} <br/><small style={{color:"#9aa7bf"}}>{a.prettyTime}</small></li>))}</ul>}
          </div>

          <div className="panel">
            <h3>Governance</h3>
            <div className="gov"><p>{govNext}</p><button onClick={() => openModule("dao")}>Open Governance</button></div>
          </div>

          <div className="panel small">
            <h3>Developer</h3>
            <p style={{fontSize:12,color:"#9aa7bf"}}>Admin tools are under /admin (coming soon). Use Remix to mint ARC & grant roles.</p>
            <button onClick={() => window.alert("Developer panel coming soon")}>Open Dev</button>
          </div>
        </aside>
      </main>

      <footer className="footer"><div>© Crypto Quest Arcade</div><div>Demo on Sepolia • For educational use only</div></footer>
    </div>
  );
}


/* ---------- Root with router ---------- */
export default function App() {
  const wallet = useWallet();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home connectWallet={wallet.connectWallet} disconnect={wallet.disconnect} account={wallet.account} network={wallet.network} provider={wallet.provider} />} />
        <Route path="/stake" element={<StakeBadgePanel provider={wallet.provider} signer={wallet.signer} account={wallet.account} connectWallet={wallet.connectWallet} ARCADE_TOKEN_ADDRESS={ARCADE_TOKEN_ADDRESS} STAKE_BADGE_ADDRESS={STAKE_BADGE_ADDRESS} />} />
        <Route path="/market" element={<MarketPanel provider={wallet.provider} signer={wallet.signer} account={wallet.account} connectWallet={wallet.connectWallet} ARCADE_TOKEN_ADDRESS={ARCADE_TOKEN_ADDRESS} TRADEHUB_ADDRESS={TRADEHUB_ADDRESS} />} />
        <Route path="/dao" element={<GovernancePanel provider={wallet.provider} signer={wallet.signer} account={wallet.account} connectWallet={wallet.connectWallet} ARCADE_TOKEN_ADDRESS={ARCADE_TOKEN_ADDRESS} ARCADE_COUNCIL_ADDRESS={ARCADE_COUNCIL_ADDRESS} />} />
        <Route path="/loot" element={<LootBoxPanel provider={wallet.provider} signer={wallet.signer} account={wallet.account} connectWallet={wallet.connectWallet} ARCADE_TOKEN_ADDRESS={ARCADE_TOKEN_ADDRESS} LOOTBOX_ADDRESS={LOOTBOX_ADDRESS} />} />
      </Routes>
    </BrowserRouter>
  );
}
