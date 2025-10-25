// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/access/AccessControl.sol";

contract ArcadeRegistry is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    struct Module {
        address moduleAddr;
        string key;    // e.g., "stake", "loot", "market", "dao"
        string title;  
        bool active;
    }

    Module[] private modules;
    mapping(address => uint256) private moduleIndex; // maps address -> index+1, 0 = not found

    event ModuleRegistered(address indexed moduleAddr, string key, string title);
    event ModuleUpdated(address indexed moduleAddr, bool active);
    event ModuleRemoved(address indexed moduleAddr);

    constructor(address admin) {
        require(admin != address(0), "zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "not operator");
        _;
    }

    function registerModule(address moduleAddr, string calldata key, string calldata title) external onlyOperator {
        require(moduleAddr != address(0), "zero module");
        require(moduleIndex[moduleAddr] == 0, "already registered");
        modules.push(Module({ moduleAddr: moduleAddr, key: key, title: title, active: true }));
        moduleIndex[moduleAddr] = modules.length; // index+1
        emit ModuleRegistered(moduleAddr, key, title);
    }

    function updateModuleStatus(address moduleAddr, bool active) external onlyOperator {
        uint256 idx = moduleIndex[moduleAddr];
        require(idx != 0, "not found");
        modules[idx - 1].active = active;
        emit ModuleUpdated(moduleAddr, active);
    }

    function removeModule(address moduleAddr) external onlyOperator {
        uint256 idx = moduleIndex[moduleAddr];
        require(idx != 0, "not found");
        uint256 i = idx - 1;
        // swap-remove
        uint256 last = modules.length - 1;
        if (i != last) {
            Module memory lastMod = modules[last];
            modules[i] = lastMod;
            moduleIndex[lastMod.moduleAddr] = i + 1;
        }
        modules.pop();
        moduleIndex[moduleAddr] = 0;
        emit ModuleRemoved(moduleAddr);
    }

    function getModules() external view returns (Module[] memory) {
        return modules;
    }

    function moduleCount() external view returns (uint256) {
        return modules.length;
    }

    function isModule(address moduleAddr) external view returns (bool) {
        return moduleIndex[moduleAddr] != 0;
    }
}
