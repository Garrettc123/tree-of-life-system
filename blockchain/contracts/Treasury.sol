// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Treasury
 * @dev Manages protocol treasury funds and allocations
 */
contract Treasury is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    struct Allocation {
        address recipient;
        uint256 amount;
        address token;
        uint256 releaseTime;
        bool executed;
        string purpose;
    }

    struct Budget {
        string category;
        uint256 allocated;
        uint256 spent;
        uint256 period; // timestamp for budget period end
    }

    uint256 public allocationCounter;
    mapping(uint256 => Allocation) public allocations;
    mapping(string => Budget) public budgets;
    mapping(address => uint256) public totalAllocated;

    event AllocationCreated(
        uint256 indexed allocationId,
        address indexed recipient,
        uint256 amount,
        address token
    );
    event AllocationExecuted(uint256 indexed allocationId);
    event BudgetCreated(string category, uint256 amount, uint256 period);
    event BudgetUpdated(string category, uint256 newAmount);
    event FundsDeposited(address indexed from, uint256 amount, address token);
    event EmergencyWithdraw(address indexed to, uint256 amount, address token);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);
        _grantRole(TREASURER_ROLE, msg.sender);
    }

    /**
     * @dev Create a new allocation
     */
    function createAllocation(
        address _recipient,
        uint256 _amount,
        address _token,
        uint256 _releaseTime,
        string memory _purpose
    ) external onlyRole(ALLOCATOR_ROLE) returns (uint256) {
        require(_recipient != address(0), "Invalid recipient");
        require(_amount > 0, "Amount must be > 0");
        require(_releaseTime > block.timestamp, "Release time must be future");

        allocationCounter++;
        uint256 allocationId = allocationCounter;

        allocations[allocationId] = Allocation({
            recipient: _recipient,
            amount: _amount,
            token: _token,
            releaseTime: _releaseTime,
            executed: false,
            purpose: _purpose
        });

        totalAllocated[_token] += _amount;

        emit AllocationCreated(allocationId, _recipient, _amount, _token);
        return allocationId;
    }

    /**
     * @dev Execute an allocation
     */
    function executeAllocation(uint256 _allocationId) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        Allocation storage allocation = allocations[_allocationId];
        require(!allocation.executed, "Already executed");
        require(block.timestamp >= allocation.releaseTime, "Not yet releasable");
        require(
            msg.sender == allocation.recipient || hasRole(TREASURER_ROLE, msg.sender),
            "Not authorized"
        );

        allocation.executed = true;
        totalAllocated[allocation.token] -= allocation.amount;

        if (allocation.token == address(0)) {
            // Native token (ETH)
            payable(allocation.recipient).transfer(allocation.amount);
        } else {
            // ERC20 token
            IERC20(allocation.token).safeTransfer(
                allocation.recipient,
                allocation.amount
            );
        }

        emit AllocationExecuted(_allocationId);
    }

    /**
     * @dev Create budget for a category
     */
    function createBudget(
        string memory _category,
        uint256 _amount,
        uint256 _period
    ) external onlyRole(GOVERNANCE_ROLE) {
        require(_amount > 0, "Amount must be > 0");
        require(_period > block.timestamp, "Period must be future");
        require(budgets[_category].allocated == 0, "Budget exists");

        budgets[_category] = Budget({
            category: _category,
            allocated: _amount,
            spent: 0,
            period: _period
        });

        emit BudgetCreated(_category, _amount, _period);
    }

    /**
     * @dev Update budget allocation
     */
    function updateBudget(string memory _category, uint256 _newAmount) 
        external 
        onlyRole(GOVERNANCE_ROLE) 
    {
        require(budgets[_category].allocated > 0, "Budget doesn't exist");
        budgets[_category].allocated = _newAmount;
        emit BudgetUpdated(_category, _newAmount);
    }

    /**
     * @dev Record spending against budget
     */
    function recordSpending(string memory _category, uint256 _amount) 
        external 
        onlyRole(TREASURER_ROLE) 
    {
        Budget storage budget = budgets[_category];
        require(budget.allocated > 0, "Budget doesn't exist");
        require(budget.spent + _amount <= budget.allocated, "Exceeds budget");
        require(block.timestamp <= budget.period, "Budget period ended");

        budget.spent += _amount;
    }

    /**
     * @dev Deposit funds to treasury
     */
    function deposit(address _token, uint256 _amount) external payable {
        if (_token == address(0)) {
            require(msg.value == _amount, "Incorrect ETH amount");
        } else {
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }

        emit FundsDeposited(msg.sender, _amount, _token);
    }

    /**
     * @dev Emergency withdraw (governance only)
     */
    function emergencyWithdraw(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyRole(GOVERNANCE_ROLE) nonReentrant {
        require(_to != address(0), "Invalid recipient");

        if (_token == address(0)) {
            payable(_to).transfer(_amount);
        } else {
            IERC20(_token).safeTransfer(_to, _amount);
        }

        emit EmergencyWithdraw(_to, _amount, _token);
    }

    /**
     * @dev Get treasury balance
     */
    function getBalance(address _token) external view returns (uint256) {
        if (_token == address(0)) {
            return address(this).balance;
        }
        return IERC20(_token).balanceOf(address(this));
    }

    /**
     * @dev Get available balance (total - allocated)
     */
    function getAvailableBalance(address _token) 
        external 
        view 
        returns (uint256) 
    {
        uint256 total;
        if (_token == address(0)) {
            total = address(this).balance;
        } else {
            total = IERC20(_token).balanceOf(address(this));
        }
        
        return total > totalAllocated[_token] ? 
            total - totalAllocated[_token] : 0;
    }

    /**
     * @dev Pause treasury operations
     */
    function pause() external onlyRole(GOVERNANCE_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause treasury operations
     */
    function unpause() external onlyRole(GOVERNANCE_ROLE) {
        _unpause();
    }

    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value, address(0));
    }
}