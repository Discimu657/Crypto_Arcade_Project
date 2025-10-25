// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/access/AccessControl.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/interfaces/IERC1155.sol";

interface IArcadeToken is IERC1155 {
    function ARCADE_COIN() external view returns (uint256);
    function awardTrophy(address to, uint256 trophyId) external;
}

contract LootBox is AccessControl, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IArcadeToken public immutable arcade;
    address public treasury;
    uint256 public pricePerBox; // expressed in ARC smallest units (wei)
    uint256 public nonce;

    // Weighted rewards config
    struct Reward {
        uint256 trophyId;
        uint256 weight; // weight relative to others
    }
    Reward[] public rewards;
    uint256 public totalWeight;

    event BoxOpened(address indexed user, uint256 indexed trophyId, uint256 timestamp, uint256 boxCount);
    event PriceUpdated(uint256 newPrice);
    event TreasuryUpdated(address newTreasury);
    event RewardAdded(uint256 trophyId, uint256 weight);
    event RewardCleared();
    event Withdrawn(address to, uint256 arcAmount);

    constructor(address arcadeAddr, uint256 priceWei, address treasuryAddr, address admin) {
        require(arcadeAddr != address(0) && treasuryAddr != address(0) && admin != address(0), "zero addr");
        arcade = IArcadeToken(arcadeAddr);
        pricePerBox = priceWei;
        treasury = treasuryAddr;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    // --- admin/config ---
    function setPrice(uint256 newPrice) external onlyRole(OPERATOR_ROLE) {
        pricePerBox = newPrice;
        emit PriceUpdated(newPrice);
    }

    function setTreasury(address newTreasury) external onlyRole(OPERATOR_ROLE) {
        require(newTreasury != address(0), "zero addr");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function addReward(uint256 trophyId, uint256 weight) external onlyRole(OPERATOR_ROLE) {
        require(weight > 0, "weight>0");
        rewards.push(Reward({ trophyId: trophyId, weight: weight }));
        totalWeight += weight;
        emit RewardAdded(trophyId, weight);
    }

    function clearRewards() external onlyRole(OPERATOR_ROLE) {
        delete rewards;
        totalWeight = 0;
        emit RewardCleared();
    }

    // Admin withdraw ARC from this contract (treasury management)
    function withdrawArc(address to, uint256 amount) external onlyRole(OPERATOR_ROLE) nonReentrant {
        require(to != address(0), "zero addr");
        uint256 arcId = arcade.ARCADE_COIN();
        uint256 bal = arcade.balanceOf(address(this), arcId);
        require(bal >= amount, "insufficient");
        arcade.safeTransferFrom(address(this), to, arcId, amount, "");
        emit Withdrawn(to, amount);
    }

    // --- open box ----
    // User must call setApprovalForAll(lootboxAddress, true) on ArcadeToken (ARC id 0)
    function openBoxes(uint256 boxCount) external nonReentrant {
        require(boxCount > 0 && boxCount <= 20, "boxCount 1..20");
        require(totalWeight > 0, "no rewards configured");

        uint256 arcId = arcade.ARCADE_COIN();
        uint256 totalPrice = pricePerBox * boxCount;

        // Pull ARC payment from buyer into this contract
        arcade.safeTransferFrom(msg.sender, address(this), arcId, totalPrice, "");

        // For each box, pick a trophy and mint
        for (uint256 i = 0; i < boxCount; i++) {
            uint256 r = _random() % totalWeight;
            uint256 acc = 0;
            uint256 chosenId = 0;
            for (uint256 j = 0; j < rewards.length; j++) {
                acc += rewards[j].weight;
                if (r < acc) {
                    chosenId = rewards[j].trophyId;
                    break;
                }
            }
            // mint trophy to user — requires LootBox has MINTER_ROLE on ArcadeToken
            arcade.awardTrophy(msg.sender, chosenId);
            emit BoxOpened(msg.sender, chosenId, block.timestamp, 1);
        }
    }

    // --- view helpers ----
    function rewardsCount() external view returns (uint256) {
        return rewards.length;
    }

    function rewardAt(uint256 idx) external view returns (uint256 trophyId, uint256 weight) {
        Reward memory rw = rewards[idx];
        return (rw.trophyId, rw.weight);
    }

    // --- randomness (NOT VRF) ---
    // This is *not* secure against miners/validators. Fine for demo/testnets only.
    function _random() internal returns (uint256) {
        unchecked { nonce++; }
        return uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender, nonce)));
    }

    // receive ERC1155
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
