// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/token/ERC1155/ERC1155.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/access/AccessControl.sol";

contract ArcadeToken is ERC1155, AccessControl {
    /// Roles
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// Token id for the fungible ArcadeCoin (ARC)
    uint256 public constant ARCADE_COIN = 0;


    constructor(address initialOwner) ERC1155("") {
        require(initialOwner != address(0), "zero owner");
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);
    }


    function mintReward(address player, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(player != address(0), "zero player");
        require(amount > 0, "zero amount");
        _mint(player, ARCADE_COIN, amount, "");
    }


    function awardTrophy(address player, uint256 trophyId) external onlyRole(MINTER_ROLE) {
        require(player != address(0), "zero player");
        require(trophyId > 0, "invalid trophyId");
        _mint(player, trophyId, 1, "");
    }

    function burnArc(address from, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(from != address(0), "zero from");
        _burn(from, ARCADE_COIN, amount);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
