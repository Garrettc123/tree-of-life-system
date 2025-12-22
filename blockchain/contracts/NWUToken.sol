// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title NWUToken
 * @dev NWU Protocol governance and utility token
 * Features: ERC20, Burnable, Votes (for governance), Access Control
 */
contract NWUToken is ERC20, ERC20Burnable, ERC20Votes, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 100 million initial

    // Vesting schedules
    struct VestingSchedule {
        uint256 totalAmount;
        uint256 released;
        uint256 startTime;
        uint256 duration;
        bool revoked;
    }

    mapping(address => VestingSchedule) public vestingSchedules;

    event VestingScheduleCreated(address indexed beneficiary, uint256 amount, uint256 duration);
    event TokensReleased(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary);

    constructor() 
        ERC20("NWU Protocol Token", "NWU") 
        ERC20Permit("NWU Protocol Token") 
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);

        // Mint initial supply to deployer
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @dev Mint new tokens (only MINTER_ROLE)
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }

    /**
     * @dev Create a vesting schedule for a beneficiary
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 duration
    ) external onlyRole(GOVERNANCE_ROLE) {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(amount > 0, "Amount must be > 0");
        require(duration > 0, "Duration must be > 0");
        require(vestingSchedules[beneficiary].totalAmount == 0, "Schedule exists");

        vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount: amount,
            released: 0,
            startTime: block.timestamp,
            duration: duration,
            revoked: false
        });

        _transfer(msg.sender, address(this), amount);
        emit VestingScheduleCreated(beneficiary, amount, duration);
    }

    /**
     * @dev Release vested tokens
     */
    function releaseVestedTokens() external {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        require(schedule.totalAmount > 0, "No vesting schedule");
        require(!schedule.revoked, "Schedule revoked");

        uint256 releasable = _computeReleasableAmount(schedule);
        require(releasable > 0, "No tokens to release");

        schedule.released += releasable;
        _transfer(address(this), msg.sender, releasable);

        emit TokensReleased(msg.sender, releasable);
    }

    /**
     * @dev Compute releasable amount based on vesting schedule
     */
    function _computeReleasableAmount(VestingSchedule memory schedule) 
        private 
        view 
        returns (uint256) 
    {
        if (block.timestamp < schedule.startTime) {
            return 0;
        }

        uint256 elapsedTime = block.timestamp - schedule.startTime;
        if (elapsedTime >= schedule.duration) {
            return schedule.totalAmount - schedule.released;
        }

        uint256 vestedAmount = (schedule.totalAmount * elapsedTime) / schedule.duration;
        return vestedAmount - schedule.released;
    }

    /**
     * @dev Get releasable amount for an address
     */
    function getReleasableAmount(address beneficiary) 
        external 
        view 
        returns (uint256) 
    {
        VestingSchedule memory schedule = vestingSchedules[beneficiary];
        if (schedule.totalAmount == 0 || schedule.revoked) {
            return 0;
        }
        return _computeReleasableAmount(schedule);
    }

    /**
     * @dev Revoke vesting schedule
     */
    function revokeVesting(address beneficiary) 
        external 
        onlyRole(GOVERNANCE_ROLE) 
    {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        require(schedule.totalAmount > 0, "No vesting schedule");
        require(!schedule.revoked, "Already revoked");

        uint256 releasable = _computeReleasableAmount(schedule);
        if (releasable > 0) {
            schedule.released += releasable;
            _transfer(address(this), beneficiary, releasable);
        }

        uint256 remaining = schedule.totalAmount - schedule.released;
        if (remaining > 0) {
            _transfer(address(this), msg.sender, remaining);
        }

        schedule.revoked = true;
        emit VestingRevoked(beneficiary);
    }

    /**
     * @dev Pause token transfers
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause token transfers
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // Override required functions
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) 
        internal 
        override(ERC20, ERC20Votes) 
    {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) 
        internal 
        override(ERC20, ERC20Votes) 
    {
        super._burn(account, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
}