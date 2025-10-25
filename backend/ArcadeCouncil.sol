// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/access/AccessControl.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/interfaces/IERC1155.sol";

interface IArcadeToken is IERC1155 {
    function ARCADE_COIN() external view returns (uint256);
}

contract ArcadeCouncil is AccessControl, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    IArcadeToken public immutable arcade;
    uint256[] public votingTokenIds;
    uint256 public proposalCount;

    struct Proposal {
        address proposer;
        string description;
        uint256 start;
        uint256 end;
        uint256 yes;
        uint256 no;
        bool tallied;
        bool passed;
        bool executed;
        address recipient;
        uint256 amount;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed id, address indexed proposer, address recipient, uint256 amount, uint256 start, uint256 end);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event ProposalTallied(uint256 indexed id, bool passed, uint256 yes, uint256 no);
    event ProposalExecuted(uint256 indexed id, bool success);

    constructor(address arcadeAddr, uint256[] memory badgeIds, address admin) {
        require(arcadeAddr != address(0) && admin != address(0), "zero addr");
        arcade = IArcadeToken(arcadeAddr);
        votingTokenIds = badgeIds;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function createPayoutProposal(
        address recipient,
        uint256 amount,
        string calldata description,
        uint256 durationSeconds
    ) external returns (uint256) {
        require(recipient != address(0), "zero recipient");
        require(amount > 0, "amount>0");
        require(durationSeconds >= 60, "duration min 60s");

        proposalCount++;
        uint256 id = proposalCount;
        Proposal storage p = proposals[id];
        p.proposer = msg.sender;
        p.description = description;
        p.start = block.timestamp;
        p.end = block.timestamp + durationSeconds;
        p.recipient = recipient;
        p.amount = amount;
        p.tallied = false;
        p.passed = false;
        p.executed = false;
        p.yes = 0;
        p.no = 0;

        emit ProposalCreated(id, msg.sender, recipient, amount, p.start, p.end);
        return id;
    }

    function votingPower(address who) public view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < votingTokenIds.length; i++) {
            total += arcade.balanceOf(who, votingTokenIds[i]);
        }
        return total;
    }

    function vote(uint256 proposalId, bool support) external {
        require(proposalId >= 1 && proposalId <= proposalCount, "bad id");
        Proposal storage p = proposals[proposalId];
        require(block.timestamp >= p.start && block.timestamp <= p.end, "voting closed");
        require(!hasVoted[proposalId][msg.sender], "already voted");
        uint256 weight = votingPower(msg.sender);
        require(weight > 0, "no voting power");

        hasVoted[proposalId][msg.sender] = true;
        if (support) p.yes += weight;
        else p.no += weight;
        emit Voted(proposalId, msg.sender, support, weight);
    }

    function tally(uint256 proposalId) external {
        require(proposalId >= 1 && proposalId <= proposalCount, "bad id");
        Proposal storage p = proposals[proposalId];
        require(block.timestamp > p.end, "voting not ended");
        require(!p.tallied, "already tallied");

        p.tallied = true;
        if (p.yes > p.no) {
            p.passed = true;
        } else {
            p.passed = false;
        }
        emit ProposalTallied(proposalId, p.passed, p.yes, p.no);
    }

    function executePayout(uint256 proposalId) external nonReentrant {
        require(proposalId >= 1 && proposalId <= proposalCount, "bad id");
        Proposal storage p = proposals[proposalId];
        require(p.tallied, "not tallied");
        require(p.passed, "proposal not passed");
        require(!p.executed, "already executed");

        uint256 arcId = arcade.ARCADE_COIN();
        uint256 treasuryBalance = arcade.balanceOf(address(this), arcId);
        require(treasuryBalance >= p.amount, "insufficient treasury balance");

        arcade.safeTransferFrom(address(this), p.recipient, arcId, p.amount, "");
        p.executed = true;
        emit ProposalExecuted(proposalId, true);
    }

    // returns 11 values to give frontend all states
    function getProposal(uint256 id) external view returns (
        address proposer,
        string memory description,
        uint256 start,
        uint256 end,
        uint256 yes,
        uint256 no,
        bool tallied,
        bool passed,
        bool executed,
        address recipient,
        uint256 amount
    ) {
        Proposal storage p = proposals[id];
        return (p.proposer, p.description, p.start, p.end, p.yes, p.no, p.tallied, p.passed, p.executed, p.recipient, p.amount);
    }

    function getProposalCount() external view returns (uint256) {
        return proposalCount;
    }

    function setVotingTokenIds(uint256[] calldata ids) external onlyRole(OPERATOR_ROLE) {
        votingTokenIds = ids;
    }

    // receive ERC1155 (treasury deposits)
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }
}
