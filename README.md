# Arcade DApp — Gamified Web3 Learning Arcade

A **gamified, educational Web3 arcade** where users **earn, stake, trade, craft, and govern** an on-chain economy — learning DeFi, NFTs, and DAO governance concepts by playing and participating in a real decentralized ecosystem.

Built with **Solidity**, **Remix IDE**, and a **React + Ethers.js frontend**.

##Features

###  Core Gameplay Modules

- **Stake & Badge** — Stake ARC tokens to earn tiered NFT badges.
- **TradeHub** — Buy/sell/trade items (ERC-1155 NFTs and ARC tokens) in a decentralized marketplace.
- **ArcadeCouncil** — On-chain DAO governance using NFT voting power.
- **ArcadeTreasury** — Collects and manages ecosystem fees.
- **ArcadeRegistry** — Registry for discovering approved game modules.

### Token System
  - `id 0`: Fungible ARC token (currency)  
  - `ids 1..N`: NFT Badges, Consumables, and Trophy types  
  - Supports `mintReward`, `awardTrophy`, and `burn`.

###  Governance
- **DAO Voting** using NFT badges  
- Treasury and role management controlled by governance  
- Timelock for secure proposal execution  

## Tech Stack
 
Smart Contracts - Solidity (Remix IDE)
Frontend - React + Vite
Wallet -  MetaMask
Blockchain - Sepolia Testnet
Interaction - Ethers.js


## Smart Contract Modules

| Contract | Description |
|-----------|--------------|
| `ArcadeToken.sol` | ERC-1155 multi-token (ARC + NFTs) |
| `ArcadeRegistry.sol` | Stores module addresses |
| `StakeBadge.sol` | Staking + reward logic |
| `TradeHub.sol` | Marketplace + escrow |
| `ArcadeCouncil.sol` | Governance + DAO |
| `ArcadeTreasury.sol` | Treasury and fund routing |


##  Requirements
###  System Requirements
- **Node.js** ≥ 18.0  
- **npm** or **yarn**
- **MetaMask** browser extension (connected to Sepolia Testnet)

###  Dependencies (auto-installed)
- `react`, `react-dom`, `vite`
- `ethers`
- `@openzeppelin/contracts(Remix IDE)

##  Setup & Execution

### 1. Clone the repo
```bash
git clone https://github.com/Discimu657/Crypto_Arcade_Project.git
cd Crypto_Arcade_Project

npm install

Compile Contracts on Remix or hardhat etc

npm run dev
```
Connect your metamask wallet account, ensure there is sepholia balance (you can get it by using a faucet(Ex.Google))
Explore with multiple accounts

 
