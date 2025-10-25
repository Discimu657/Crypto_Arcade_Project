// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/interfaces/IERC1155.sol";

interface IArcadeToken is IERC1155 {
    function ARCADE_COIN() external view returns (uint256);
    function mintReward(address player, uint256 amount) external;
    function awardTrophy(address player, uint256 trophyId) external;
    function MINTER_ROLE() external view returns (bytes32);
}

contract StakeBadge is ERC1155Holder, ReentrancyGuard {
    IArcadeToken public immutable arcade;
    address public admin;

    struct Stake {
        uint256 amount;      // ARC (smallest unit)
        uint256 startAt;     // timestamp
        uint256 lockUntil;   // timestamp
        bool rewardClaimed;  // has harvested
    }

    mapping(address => Stake) public stakes;

    // Demo-friendly lock durations (seconds). Change these to days for production.
    uint256 public constant TIER_SHORT_SECONDS = 2 * 60;   // 2 minutes (demo)
    uint256 public constant TIER_MEDIUM_SECONDS = 5 * 60;  // 5 minutes
    uint256 public constant TIER_LONG_SECONDS = 10 * 60;   // 10 minutes

    // Reward percentages (simple tokenomics for demo)
    uint256 public constant PCT_SHORT = 5;   // 5%
    uint256 public constant PCT_MEDIUM = 15; // 15%
    uint256 public constant PCT_LONG = 40;   // 40%

    // Trophy IDs (ArcadeToken should treat >0 as NFT IDs)
    uint256 public constant TROPHY_BRONZE = 1;
    uint256 public constant TROPHY_SILVER = 2;
    uint256 public constant TROPHY_GOLD = 3;

    // Early withdrawal penalty percent (sent to admin/treasury)
    uint256 public earlyPenaltyPct = 1; // 1%

    event Staked(address indexed user, uint256 amount, uint256 lockUntil, uint8 tier);
    event Harvested(address indexed user, uint256 reward, uint256 trophyId);
    event WithdrawnEarly(address indexed user, uint256 returned, uint256 fee);
    event WithdrawnAfterHarvest(address indexed user, uint256 returned);
    event EarlyPenaltyChanged(uint256 newPct);
    event AdminChanged(address newAdmin);

    constructor(address arcadeTokenAddress) {
        require(arcadeTokenAddress != address(0), "zero token address");
        arcade = IArcadeToken(arcadeTokenAddress);
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    /// Admin: change early penalty percent (0..100)
    function setEarlyPenaltyPct(uint256 pct) external onlyAdmin {
        require(pct <= 100, "pct>100");
        earlyPenaltyPct = pct;
        emit EarlyPenaltyChanged(pct);
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "zero admin");
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    /// Stake ARC with chosen tier: 0=short,1=medium,2=long
    function stake(uint256 amount, uint8 tier) external nonReentrant {
        require(amount > 0, "zero amount");
        require(tier <= 2, "invalid tier");
        Stake storage s = stakes[msg.sender];
        require(s.amount == 0, "already staking");

        uint256 arcId = arcade.ARCADE_COIN();
        uint256 balance = arcade.balanceOf(msg.sender, arcId);
        require(balance >= amount, "insufficient ARC");

        // transfer ARC from user to this contract (user must approve)
        arcade.safeTransferFrom(msg.sender, address(this), arcId, amount, "");

        uint256 lockSeconds;
        if (tier == 0) lockSeconds = TIER_SHORT_SECONDS;
        else if (tier == 1) lockSeconds = TIER_MEDIUM_SECONDS;
        else lockSeconds = TIER_LONG_SECONDS;

        s.amount = amount;
        s.startAt = block.timestamp;
        s.lockUntil = block.timestamp + lockSeconds;
        s.rewardClaimed = false;

        emit Staked(msg.sender, amount, s.lockUntil, tier);
    }

    /// Preview the matured reward and trophy id (if the user holds until lockUntil)
    function previewMatureReward(address who) public view returns (uint256 reward, uint256 trophyId) {
        Stake memory s = stakes[who];
        if (s.amount == 0) return (0, 0);

        uint256 lockLen = s.lockUntil - s.startAt;
        if (lockLen == TIER_SHORT_SECONDS) {
            reward = (s.amount * PCT_SHORT) / 100;
            trophyId = TROPHY_BRONZE;
        } else if (lockLen == TIER_MEDIUM_SECONDS) {
            reward = (s.amount * PCT_MEDIUM) / 100;
            trophyId = TROPHY_SILVER;
        } else {
            reward = (s.amount * PCT_LONG) / 100;
            trophyId = TROPHY_GOLD;
        }
    }

    /// Harvest matured reward (requires lockUntil passed). Mints ARC reward and trophy NFT (if any).
    function harvest() external nonReentrant {
        Stake storage s = stakes[msg.sender];
        require(s.amount > 0, "no stake");
        require(!s.rewardClaimed, "already claimed");
        require(block.timestamp >= s.lockUntil, "not matured");

        (uint256 reward, uint256 trophyId) = previewMatureReward(msg.sender);
        s.rewardClaimed = true;

        if (reward > 0) {
            // requires this contract to have MINTER_ROLE on ArcadeToken
            arcade.mintReward(msg.sender, reward);
        }
        if (trophyId != 0) {
            arcade.awardTrophy(msg.sender, trophyId); // <-- intentional bug? See note below.
        }

        emit Harvested(msg.sender, reward, trophyId);
    }

 
    function withdrawEarly() external nonReentrant {
        Stake storage s = stakes[msg.sender];
        require(s.amount > 0, "no stake");
        require(!s.rewardClaimed, "already claimed");

        uint256 amount = s.amount;
        uint256 fee = (amount * earlyPenaltyPct) / 100;
        uint256 toReturn = amount - fee;

        delete stakes[msg.sender];

        uint256 arcId = arcade.ARCADE_COIN();
        // return principal - fee
        arcade.safeTransferFrom(address(this), msg.sender, arcId, toReturn, "");
        // send fee to admin
        if (fee > 0) {
            arcade.safeTransferFrom(address(this), admin, arcId, fee, "");
        }

        emit WithdrawnEarly(msg.sender, toReturn, fee);
    }

    /// Withdraw principal after harvest (safe way)
    function withdrawAfterHarvest() external nonReentrant {
        Stake storage s = stakes[msg.sender];
        require(s.amount > 0, "no stake");
        require(s.rewardClaimed, "harvest first");

        uint256 amount = s.amount;
        delete stakes[msg.sender];

        uint256 arcId = arcade.ARCADE_COIN();
        arcade.safeTransferFrom(address(this), msg.sender, arcId, amount, "");

        emit WithdrawnAfterHarvest(msg.sender, amount);
    }

    function stakeInfo(address who) external view returns (uint256 amount, uint256 startAt, uint256 lockUntil, bool rewardClaimed) {
        Stake memory s = stakes[who];
        return (s.amount, s.startAt, s.lockUntil, s.rewardClaimed);
    }
}
