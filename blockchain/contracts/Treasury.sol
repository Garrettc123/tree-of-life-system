// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Treasury
 * @dev Manages protocol funds with multi-sig approval and budget allocation
 */
contract Treasury is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant TREASURY_ADMIN = keccak256("TREASURY_ADMIN");
    bytes32 public constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    
    struct Budget {
        string category;
        uint256 allocated;
        uint256 spent;
        uint256 startTime;
        uint256 endTime;
        bool active;
    }
    
    struct Withdrawal {
        address recipient;
        uint256 amount;
        string purpose;
        uint256 approvalCount;
        mapping(address => bool) approvals;
        bool executed;
        uint256 requestedAt;
    }
    
    // State variables
    uint256 public approvalThreshold;
    uint256 public withdrawalCount;
    mapping(uint256 => Withdrawal) public withdrawals;
    mapping(uint256 => Budget) public budgets;
    uint256 public budgetCount;
    
    // Events
    event WithdrawalRequested(uint256 indexed withdrawalId, address recipient, uint256 amount, string purpose);
    event WithdrawalApproved(uint256 indexed withdrawalId, address approver);
    event WithdrawalExecuted(uint256 indexed withdrawalId, address recipient, uint256 amount);
    event BudgetAllocated(uint256 indexed budgetId, string category, uint256 amount, uint256 startTime, uint256 endTime);
    event BudgetUpdated(uint256 indexed budgetId, uint256 newAmount);
    event FundsReceived(address indexed sender, uint256 amount);
    event ApprovalThresholdUpdated(uint256 newThreshold);
    
    constructor(uint256 _approvalThreshold) {
        require(_approvalThreshold > 0, "Invalid threshold");
        approvalThreshold = _approvalThreshold;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(TREASURY_ADMIN, msg.sender);
        _grantRole(APPROVER_ROLE, msg.sender);
    }
    
    /**
     * @dev Request a withdrawal from treasury
     */
    function requestWithdrawal(
        address _recipient,
        uint256 _amount,
        string memory _purpose
    ) external onlyRole(TREASURY_ADMIN) returns (uint256) {
        require(_recipient != address(0), "Invalid recipient");
        require(_amount > 0, "Invalid amount");
        require(address(this).balance >= _amount, "Insufficient balance");
        
        uint256 withdrawalId = withdrawalCount++;
        Withdrawal storage withdrawal = withdrawals[withdrawalId];
        withdrawal.recipient = _recipient;
        withdrawal.amount = _amount;
        withdrawal.purpose = _purpose;
        withdrawal.requestedAt = block.timestamp;
        
        emit WithdrawalRequested(withdrawalId, _recipient, _amount, _purpose);
        return withdrawalId;
    }
    
    /**
     * @dev Approve a withdrawal request
     */
    function approveWithdrawal(uint256 _withdrawalId) external onlyRole(APPROVER_ROLE) {
        Withdrawal storage withdrawal = withdrawals[_withdrawalId];
        require(!withdrawal.executed, "Already executed");
        require(!withdrawal.approvals[msg.sender], "Already approved");
        
        withdrawal.approvals[msg.sender] = true;
        withdrawal.approvalCount++;
        
        emit WithdrawalApproved(_withdrawalId, msg.sender);
        
        // Auto-execute if threshold reached
        if (withdrawal.approvalCount >= approvalThreshold) {
            _executeWithdrawal(_withdrawalId);
        }
    }
    
    /**
     * @dev Execute approved withdrawal
     */
    function _executeWithdrawal(uint256 _withdrawalId) internal nonReentrant {
        Withdrawal storage withdrawal = withdrawals[_withdrawalId];
        require(!withdrawal.executed, "Already executed");
        require(withdrawal.approvalCount >= approvalThreshold, "Insufficient approvals");
        
        withdrawal.executed = true;
        
        (bool success, ) = withdrawal.recipient.call{value: withdrawal.amount}("");
        require(success, "Transfer failed");
        
        emit WithdrawalExecuted(_withdrawalId, withdrawal.recipient, withdrawal.amount);
    }
    
    /**
     * @dev Allocate budget for a category
     */
    function allocateBudget(
        string memory _category,
        uint256 _amount,
        uint256 _duration
    ) external onlyRole(TREASURY_ADMIN) returns (uint256) {
        require(_amount > 0, "Invalid amount");
        require(_duration > 0, "Invalid duration");
        
        uint256 budgetId = budgetCount++;
        Budget storage budget = budgets[budgetId];
        budget.category = _category;
        budget.allocated = _amount;
        budget.startTime = block.timestamp;
        budget.endTime = block.timestamp + _duration;
        budget.active = true;
        
        emit BudgetAllocated(budgetId, _category, _amount, budget.startTime, budget.endTime);
        return budgetId;
    }
    
    /**
     * @dev Update budget allocation
     */
    function updateBudget(uint256 _budgetId, uint256 _newAmount) 
        external 
        onlyRole(TREASURY_ADMIN) 
    {
        Budget storage budget = budgets[_budgetId];
        require(budget.active, "Budget not active");
        require(block.timestamp < budget.endTime, "Budget expired");
        
        budget.allocated = _newAmount;
        emit BudgetUpdated(_budgetId, _newAmount);
    }
    
    /**
     * @dev Record spending against budget
     */
    function recordSpending(uint256 _budgetId, uint256 _amount) 
        external 
        onlyRole(TREASURY_ADMIN) 
    {
        Budget storage budget = budgets[_budgetId];
        require(budget.active, "Budget not active");
        require(budget.spent + _amount <= budget.allocated, "Exceeds budget");
        
        budget.spent += _amount;
    }
    
    /**
     * @dev Update approval threshold
     */
    function updateApprovalThreshold(uint256 _newThreshold) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_newThreshold > 0, "Invalid threshold");
        approvalThreshold = _newThreshold;
        emit ApprovalThresholdUpdated(_newThreshold);
    }
    
    /**
     * @dev Get budget details
     */
    function getBudget(uint256 _budgetId) 
        external 
        view 
        returns (
            string memory category,
            uint256 allocated,
            uint256 spent,
            uint256 remaining,
            bool active
        ) 
    {
        Budget storage budget = budgets[_budgetId];
        return (
            budget.category,
            budget.allocated,
            budget.spent,
            budget.allocated - budget.spent,
            budget.active
        );
    }
    
    /**
     * @dev Emergency pause
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @dev Receive ETH
     */
    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }
    
    /**
     * @dev Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}