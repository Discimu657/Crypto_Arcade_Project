// src/components/MarketPanel.jsx
import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import "../styles/MarketPanel.css";
import tradeAbi from "../abi/TradeHub.json";
import arcadeAbi from "../abi/ArcadeToken.json";
import { ARCADE_TOKEN_ADDRESS as DEFAULT_ARCADE_TOKEN_ADDRESS, TRADEHUB_ADDRESS as DEFAULT_TRADEHUB_ADDRESS } from "../config";

export default function MarketPanel({
  provider,
  signer,
  account,
  connectWallet,
  ARCADE_TOKEN_ADDRESS = DEFAULT_ARCADE_TOKEN_ADDRESS,
  TRADEHUB_ADDRESS = DEFAULT_TRADEHUB_ADDRESS,
}) {
  // Two distinct contract instances:
  // arcContract is always the main ArcadeToken (used for ARC approvals / ARCADE_COIN id)
  // sellTokenContract is the selected ERC-1155 token contract (the item you want to sell)
  const [tradeHub, setTradeHub] = useState(null);
  const [arcContract, setArcContract] = useState(null);
  const [sellTokenContract, setSellTokenContract] = useState(null);

  // UI state
  const [selectedTokenAddr, setSelectedTokenAddr] = useState(ARCADE_TOKEN_ADDRESS);
  const [customTokenMode, setCustomTokenMode] = useState(false);

  const [listTokenId, setListTokenId] = useState("");
  const [listAmount, setListAmount] = useState("1");
  const [listPriceArc, setListPriceArc] = useState("1");
  const [listStatus, setListStatus] = useState("");

  const [listings, setListings] = useState([]);
  const [refreshToggle, setRefreshToggle] = useState(false);

  // approvals / balances
  const [isApprovedForToken, setIsApprovedForToken] = useState(false); // for selected token (seller)
  const [isApprovedForArc, setIsApprovedForArc] = useState(false);     // for ARC (buyer)
  const [tokenBalance, setTokenBalance] = useState("0");

  const [loading, setLoading] = useState(false);

  // instantiate contracts
  useEffect(() => {
    if (!signer) {
      setTradeHub(null);
      setArcContract(null);
      setSellTokenContract(null);
      return;
    }
    setTradeHub(new ethers.Contract(TRADEHUB_ADDRESS, tradeAbi, signer));
    // arcContract always points to the ArcadeToken (ARC currency AND token collection)
    setArcContract(new ethers.Contract(ARCADE_TOKEN_ADDRESS, arcadeAbi, signer));
    // sellTokenContract points to selected token (may be same as ARCADE_TOKEN_ADDRESS)
    if (ethers.isAddress(selectedTokenAddr)) {
      setSellTokenContract(new ethers.Contract(selectedTokenAddr, arcadeAbi, signer));
    } else {
      setSellTokenContract(null);
    }
  }, [signer, selectedTokenAddr, ARCADE_TOKEN_ADDRESS, TRADEHUB_ADDRESS]);

  // Helper: refresh approvals and balances (uses arcContract and sellTokenContract)
  const refreshApprovalsAndBalances = useCallback(async () => {
    if (!account || !arcContract) {
      setIsApprovedForToken(false);
      setIsApprovedForArc(false);
      setTokenBalance("0");
      return;
    }
    try {
      // ARC approval check (always on arcContract)
      const arcApproved = await arcContract.isApprovedForAll(account, TRADEHUB_ADDRESS).catch(() => false);
      setIsApprovedForArc(Boolean(arcApproved));

      // Selected token approval & balance (seller side)
      if (sellTokenContract && ethers.isAddress(selectedTokenAddr)) {
        const tokenApproved = await sellTokenContract.isApprovedForAll(account, TRADEHUB_ADDRESS).catch(() => false);
        setIsApprovedForToken(Boolean(tokenApproved));
        if (listTokenId !== "" && Number.isInteger(Number(listTokenId))) {
          const balBn = await sellTokenContract.balanceOf(account, Number(listTokenId)).catch(() => ethers.BigInt(0));
          // ERC-1155 token ids are integer counts; format as integer string
          setTokenBalance(balBn ? balBn.toString() : "0");
        } else {
          setTokenBalance("0");
        }
      } else {
        // No selected token contract; reset token-specific state
        setIsApprovedForToken(false);
        setTokenBalance("0");
      }
    } catch (err) {
      console.error("refreshApprovalsAndBalances error", err);
    }
  }, [arcContract, sellTokenContract, account, TRADEHUB_ADDRESS, selectedTokenAddr, listTokenId]);

  useEffect(() => {
    refreshApprovalsAndBalances();
  }, [arcContract, sellTokenContract, account, tradeHub, listTokenId, refreshToggle, refreshApprovalsAndBalances]);

  // ------------------ Listings fetch ------------------
  const loadListings = useCallback(async () => {
    if (!tradeHub) return;
    try {
      const countBn = await tradeHub.listingsCount();
      const count = Number(countBn.toString());
      const arr = [];
      for (let i = 0; i < count; i++) {
        const L = await tradeHub.listings(i);
        arr.push({
          id: i,
          seller: L.seller,
          tokenAddress: L.tokenAddress,
          tokenId: L.tokenId.toString(),
          amount: L.amount.toString(),
          pricePerUnit: L.pricePerUnit.toString(),
          active: L.active,
        });
      }
      // show newest first
      setListings(arr.reverse());
    } catch (err) {
      console.error("loadListings err", err);
    }
  }, [tradeHub]);

  useEffect(() => {
    if (tradeHub) loadListings();
  }, [tradeHub, refreshToggle, loadListings]);

  // ------------------ Approve token (seller) ------------------
  async function approveTokenForMarketplace() {
    if (!sellTokenContract || !signer || !account) return alert("Connect wallet first and pick a valid token contract");
    setLoading(true);
    try {
      const tx = await sellTokenContract.setApprovalForAll(TRADEHUB_ADDRESS, true);
      setListStatus("Confirm token approval in MetaMask...");
      await tx.wait();
      setIsApprovedForToken(true);
      setListStatus("Token approval confirmed.");
    } catch (err) {
      console.error("approveTokenForMarketplace", err);
      setListStatus("Approval failed: " + (err?.reason || err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // ------------------ Approve ARC for marketplace (buyer) ------------------
  async function approveArcForMarketplace() {
    if (!arcContract || !signer || !account) return alert("Connect wallet first");
    setLoading(true);
    try {
      const tx = await arcContract.setApprovalForAll(TRADEHUB_ADDRESS, true);
      setListStatus("Confirm ARC approval in MetaMask...");
      await tx.wait();
      setIsApprovedForArc(true);
      setListStatus("ARC approval confirmed.");
    } catch (err) {
      console.error("approveArcForMarketplace", err);
      setListStatus("ARC approval failed: " + (err?.reason || err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // ------------------ Create listing (seller) ------------------
  async function handleCreateListing() {
    if (!tradeHub || !sellTokenContract) return alert("Connect wallet first and select a valid token contract");
    if (!isApprovedForToken) return alert("Please approve marketplace to manage your token first (Approve button).");
    if (!listTokenId) return alert("Enter token ID");
    if (!listAmount || Number(listAmount) <= 0) return alert("Enter amount > 0");
    if (!listPriceArc || Number(listPriceArc) <= 0) return alert("Enter price > 0 ARC");

    setLoading(true);
    try {
      // amount: integer units; price: in ARC wei
      const amountInt = ethers.parseUnits(String(listAmount), 0); // integer
      const priceWei = ethers.parseUnits(String(listPriceArc), 18);

      setListStatus("Creating listing — confirm in MetaMask...");
      const tx = await tradeHub.listItem(selectedTokenAddr, Number(listTokenId), amountInt, priceWei);
      await tx.wait();
      setListStatus("Listing created successfully.");
      setRefreshToggle((t) => !t);
      // refresh approvals & listings
      await refreshApprovalsAndBalances();
      await loadListings();
    } catch (err) {
      console.error("handleCreateListing error", err);
      setListStatus("Listing failed: " + (err?.reason || err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // ------------------ Buy a listing (buyer) ------------------
  async function handleBuy(listing) {
    if (!tradeHub || !arcContract) return alert("Connect wallet first");
    if (!isApprovedForArc) {
      setListStatus("Buyer must approve ARC for the marketplace first.");
      return;
    }
    setLoading(true);
    try {
      setListStatus("Buying — confirm in MetaMask...");
      const tx = await tradeHub.buy(listing.id, Number(listing.amount));
      await tx.wait();
      setListStatus("Purchase successful.");
      setRefreshToggle((t) => !t);
      await refreshApprovalsAndBalances();
      await loadListings();
    } catch (err) {
      console.error("handleBuy err", err);
      setListStatus("Buy failed: " + (err?.reason || err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // ------------------ Cancel listing (seller) ------------------
  async function handleCancel(listing) {
    if (!tradeHub || !signer) return alert("Connect wallet first");
    setLoading(true);
    try {
      setListStatus("Canceling listing — confirm in MetaMask...");
      const tx = await tradeHub.cancelListing(listing.id);
      await tx.wait();
      setListStatus("Listing canceled.");
      setRefreshToggle((t) => !t);
    } catch (err) {
      console.error("cancel err", err);
      setListStatus("Cancel failed: " + (err?.reason || err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  // UI Helpers
  function formatArc(weiStr) {
    try {
      return ethers.formatUnits(weiStr, 18);
    } catch {
      return "0";
    }
  }

  // small token select helper: when user picks "Custom", show input
  function handleTokenSelectChange(v) {
    if (v === "__custom__") {
      setCustomTokenMode(true);
      setSelectedTokenAddr(""); // will be filled when user types or blurs
      setSellTokenContract(null);
    } else {
      setCustomTokenMode(false);
      setSelectedTokenAddr(v);
    }
  }

  return (
    <div className="market-root">
      <div className="market-header">
        <button className="back-btn" onClick={() => (window.location.href = "/")}>← Back</button>
        <h2>TradeHub Marketplace</h2>
        <div className="wallet-compact">
          {!account ? (
            <button className="connect" onClick={connectWallet}>Connect Wallet</button>
          ) : (
            <div className="acct">{account.substring(0,6)}...{account.substring(account.length-4)}</div>
          )}
        </div>
      </div>

      <div className="market-grid">
        <div className="panel sell-panel">
          <h3>Create Listing (Seller)</h3>

          <label>Token contract</label>
          <div className="token-select">
            <select value={customTokenMode ? "__custom__" : selectedTokenAddr} onChange={(e) => handleTokenSelectChange(e.target.value)}>
              <option value={ARCADE_TOKEN_ADDRESS}>ArcadeToken (default)</option>
              <option value="__custom__">Use custom contract address</option>
            </select>
            {customTokenMode && (
              <input
                placeholder="Enter ERC-1155 contract address (0x...)"
                onBlur={(e)=> {
                  const v = e.target.value.trim();
                  if (ethers.isAddress(v)) {
                    setSelectedTokenAddr(v);
                    setSellTokenContract(new ethers.Contract(v, arcadeAbi, signer));
                  } else {
                    alert("enter a valid address");
                    setSelectedTokenAddr("");
                    setSellTokenContract(null);
                  }
                }}
              />
            )}
          </div>

          <label>Token ID (e.g. 1 for Bronze trophy)</label>
          <input type="number" min="0" value={listTokenId} onChange={(e) => setListTokenId(e.target.value)} placeholder="Token ID (integer)" />

          <div className="row-two">
            <div>
              <label>Amount</label>
              <input type="number" min="1" value={listAmount} onChange={(e) => setListAmount(e.target.value)} />
            </div>
            <div>
              <label>Price per unit (ARC)</label>
              <input type="number" min="0.0001" value={listPriceArc} onChange={(e) => setListPriceArc(e.target.value)} />
            </div>
          </div>

          <div className="approvals">
            <div>
              <label>Marketplace approval (seller):</label>
              <div>
                <button onClick={approveTokenForMarketplace} disabled={!account || isApprovedForToken || loading || !sellTokenContract}>
                  {isApprovedForToken ? "Approved ✓" : "Approve marketplace (seller)"}
                </button>
                <span className="muted"> This authorizes the marketplace to escrow your token when listing.</span>
              </div>
            </div>

            <div style={{marginTop:12}}>
              <label>Your balance of tokenId:</label>
              <div>{tokenBalance}</div>
            </div>
          </div>

          <div className="actions">
            <button className="primary" onClick={handleCreateListing} disabled={loading || !isApprovedForToken || !selectedTokenAddr}>
              {loading ? "Working..." : "Create Listing"}
            </button>
          </div>

          <div className="status">{listStatus}</div>
        </div>

        <div className="panel listings-panel">
          <h3>Active Listings</h3>
          <div className="list-controls">
            <button onClick={() => setRefreshToggle((t) => !t)}>Refresh</button>
          </div>

          <div className="listings">
            {listings.length === 0 ? (
              <p className="muted">No active listings yet.</p>
            ) : (
              listings.map((L) => {
                const sellerLower = (L.seller || "").toLowerCase();
                const acctLower = (account || "").toLowerCase();
                const isSeller = sellerLower === acctLower;
                return (
                  <div className="listing-card" key={L.id}>
                    <div className="listing-top">
                      <div className="listing-title">#{L.id} — Token {L.tokenAddress} : ID {L.tokenId}</div>
                      <div className="listing-seller">Seller: {isSeller ? "You" : `${L.seller.substring(0,6)}...${L.seller.slice(-4)}`}</div>
                    </div>

                    <div className="listing-body">
                      <div>Qty: <strong>{L.amount}</strong></div>
                      <div>Price/unit: <strong>{formatArc(L.pricePerUnit)} ARC</strong></div>
                      <div>Total: <strong>{(Number(formatArc(L.pricePerUnit)) * Number(L.amount)).toFixed(6)} ARC</strong></div>
                    </div>

                    <div className="listing-actions">
                      {isSeller ? (
                        <button onClick={() => handleCancel(L)}>Cancel Listing</button>
                      ) : (
                        <>
                          <div>
                            <button onClick={async () => {
                              if (!isApprovedForArc) {
                                await approveArcForMarketplace();
                              } else {
                                await handleBuy(L);
                              }
                            }}>
                              {isApprovedForArc ? `Buy ${L.amount}` : "Approve ARC then Buy"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="market-help">
        <h4>How to use</h4>
        <ol>
          <li>Connect your wallet (top-right).</li>
          <li>To <strong>sell</strong>: select token contract (ArcadeToken by default), enter the <strong>token ID</strong> (badges are ids &gt; 0), amount, and price. Click <em>Approve marketplace (seller)</em>, then <em>Create Listing</em>. The marketplace will escrow your token.</li>
          <li>To <strong>buy</strong>: click <em>Approve ARC then Buy</em> (first click will approve ARC if not done), then confirm buy. The buyer pays ARC and receives the item from marketplace escrow.</li>
          <li>Verify in Remix: check `ArcadeToken.balanceOf(buyer, tokenId)` and `ArcadeToken.balanceOf(seller, tokenId)` and `TradeHub.listings(listingId)`.</li>
        </ol>
      </div>
    </div>
  );
}
