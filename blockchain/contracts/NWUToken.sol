// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title NWUToken
 * @dev Network of Wisdom United governance and utility token
 * Features: Voting, Staking, Burning, Minting controls
 */
contract NWUToken is ERC20, ERC20Burnable, ERC20Votes, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 100 million initial

    struct StakeInfo {
        uint256 amount;
        uint256 timestamp;
        uint256 lockPeriod;
    }

    mapping(address => StakeInfo) public stakes;
    uint256 public totalStaked;
    uint256 public constant MIN_STAKE_PERIOD = 30 days;

    event Staked(address indexed user, uint256 amount, uint256 lockPeriod);
    event Unstaked(address indexed user, uint256 amount, uint256 reward);
    event RewardDistributed(address indexed user, uint256 amount);

    constructor() ERC20("Network of Wisdom United", "NWU") ERC20Permit("Network of Wisdom United") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        
        _mint(msg.sender, INITIAL_SUPPLY);
    }

    /**
     * @dev Stake tokens for governance voting power
     * @param amount Amount of tokens to stake
     * @param lockPeriod Lock period in seconds
     */
    function stake(uint256 amount, uint256 lockPeriod) external whenNotPaused {
        require(amount > 0, "Cannot stake 0");
        require(lockPeriod >= MIN_STAKE_PERIOD, "Lock period too short");
        require(stakes[msg.sender].amount == 0, "Already staking");

        _transfer(msg.sender, address(this), amount);
        
        stakes[msg.sender] = StakeInfo({
            amount: amount,
            timestamp: block.timestamp,
            lockPeriod: lockPeriod
        });

        totalStaked += amount;
        emit Staked(msg.sender, amount, lockPeriod);
    }

    /**
     * @dev Unstake tokens after lock period
     */
    function unstake() external whenNotPaused {
        StakeInfo memory stakeInfo = stakes[msg.sender];
        require(stakeInfo.amount > 0, "No active stake");
        require(
            block.timestamp >= stakeInfo.timestamp + stakeInfo.lockPeriod,
            "Lock period not ended"
        );

        uint256 reward = calculateStakingReward(msg.sender);
        uint256 totalAmount = stakeInfo.amount + reward;

        delete stakes[msg.sender];
        totalStaked -= stakeInfo.amount;

        if (reward > 0 && totalSupply() + reward <= MAX_SUPPLY) {
            _mint(msg.sender, reward);
        }
        
        _transfer(address(this), msg.sender, stakeInfo.amount);
        emit Unstaked(msg.sender, stakeInfo.amount, reward);
    }

    /**
     * @dev Calculate staking reward based on amount and duration
     * @param staker Address of the staker
     * @return Reward amount
     */
    function calculateStakingReward(address staker) public view returns (uint256) {
        StakeInfo memory stakeInfo = stakes[staker];
        if (stakeInfo.amount == 0) return 0;

        uint256 stakeDuration = block.timestamp - stakeInfo.timestamp;
        if (stakeDuration < stakeInfo.lockPeriod) return 0;

        // 5% APY base rate, bonus for longer locks
        uint256 baseRate = 5;
        uint256 lockBonus = (stakeInfo.lockPeriod / 30 days) - 1; // Extra 1% per month
        uint256 totalRate = baseRate + lockBonus;

        return (stakeInfo.amount * totalRate * stakeDuration) / (365 days * 100);
    }

    /**
     * @dev Mint new tokens (minter role only)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "Max supply exceeded");
        _mint(to, amount);
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
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Votes) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._mint(to, amount);
    }

    function _burn(address account, uint256 amount) internal override(ERC20, ERC20Votes) {
        super._burn(account, amount);
    }
}