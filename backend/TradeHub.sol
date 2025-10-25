// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/access/AccessControl.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/interfaces/IERC1155.sol";

interface IArcadeToken is IERC1155 {
    function ARCADE_COIN() external view returns (uint256);
}

contract TradeHub is ReentrancyGuard, AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IArcadeToken public immutable arcade;
    address public treasury; // where fees are sent
    uint256 public feePct; // percent e.g., 2 = 2%

    struct Listing {
        address seller;
        address tokenAddress; // ERC-1155 token contract
        uint256 tokenId;
        uint256 amount; // currently available quantity in listing
        uint256 pricePerUnit; // in ARC smallest unit
        bool active;
    }

    Listing[] public listings;

    event ItemListed(uint256 indexed listingId, address indexed seller, address tokenAddress, uint256 tokenId, uint256 amount, uint256 pricePerUnit);
    event ListingCancelled(uint256 indexed listingId);
    event ItemPurchased(uint256 indexed listingId, address indexed buyer, uint256 quantity, uint256 totalPrice);

    constructor(address arcadeAddr, address _treasury, uint256 _feePct, address admin) {
        require(arcadeAddr != address(0) && _treasury != address(0) && admin != address(0), "zero address");
        arcade = IArcadeToken(arcadeAddr);
        treasury = _treasury;
        feePct = _feePct;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    // seller lists an ERC-1155 item; token contract must be already approved to this marketplace
    function listItem(address tokenAddress, uint256 tokenId, uint256 amount, uint256 pricePerUnit) external nonReentrant {
        require(amount > 0, "amount>0");
        require(pricePerUnit > 0, "price>0");
        // transfer the item into escrow
        IERC1155(tokenAddress).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
        listings.push(Listing({
            seller: msg.sender,
            tokenAddress: tokenAddress,
            tokenId: tokenId,
            amount: amount,
            pricePerUnit: pricePerUnit,
            active: true
        }));
        uint256 id = listings.length - 1;
        emit ItemListed(id, msg.sender, tokenAddress, tokenId, amount, pricePerUnit);
    }

    // cancel listing: only seller or admin
    function cancelListing(uint256 listingId) external nonReentrant {
        require(listingId < listings.length, "invalid id");
        Listing storage L = listings[listingId];
        require(L.active, "inactive");
        require(msg.sender == L.seller || hasRole(OPERATOR_ROLE, msg.sender), "not allowed");
        // return tokens to seller
        IERC1155(L.tokenAddress).safeTransferFrom(address(this), L.seller, L.tokenId, L.amount, "");
        L.active = false;
        L.amount = 0;
        emit ListingCancelled(listingId);
    }

    // buy from a listing (buyer must approve TradeHub to spend ARC)
    function buy(uint256 listingId, uint256 quantity) external nonReentrant {
        require(listingId < listings.length, "invalid id");
        Listing storage L = listings[listingId];
        require(L.active && L.amount >= quantity && quantity > 0, "not available");
        uint256 totalPrice = L.pricePerUnit * quantity;
        uint256 fee = (totalPrice * feePct) / 100;
        uint256 sellerProceeds = totalPrice - fee;

        uint256 arcId = arcade.ARCADE_COIN();

        // transfer ARC from buyer to seller
        arcade.safeTransferFrom(msg.sender, L.seller, arcId, sellerProceeds, "");
        if (fee > 0) {
            arcade.safeTransferFrom(msg.sender, treasury, arcId, fee, "");
        }

        // transfer item from escrow to buyer
        IERC1155(L.tokenAddress).safeTransferFrom(address(this), msg.sender, L.tokenId, quantity, "");

        L.amount -= quantity;
        if (L.amount == 0) {
            L.active = false;
        }

        emit ItemPurchased(listingId, msg.sender, quantity, totalPrice);
    }

    // admin functions
    function setFeePct(uint256 _feePct) external onlyRole(OPERATOR_ROLE) {
        require(_feePct <= 100, "pct>100");
        feePct = _feePct;
    }

    function setTreasury(address _treasury) external onlyRole(OPERATOR_ROLE) {
        require(_treasury != address(0), "zero");
        treasury = _treasury;
    }

    // view helper: total listings
    function listingsCount() external view returns (uint256) {
        return listings.length;
    }

    // receive ERC1155 (for escrow) - must be implemented
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
