// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title NWUProtocol
 * @dev Core protocol contract for Network of Wisdom United
 * Implements contribution verification, reward distribution, and governance
 */
contract NWUProtocol is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant CONTRIBUTOR_ROLE = keccak256("CONTRIBUTOR_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    struct Contribution {
        address contributor;
        string dataHash; // IPFS hash
        uint256 timestamp;
        uint256 rewardAmount;
        ContributionStatus status;
        uint8 verificationCount;
        bytes32 categoryId;
    }

    enum ContributionStatus {
        Pending,
        Verified,
        Rejected,
        Rewarded
    }

    // State variables
    mapping(uint256 => Contribution) public contributions;
    mapping(uint256 => mapping(address => bool)) public verifications;
    mapping(address => uint256) public contributorScores;
    uint256 public contributionCounter;
    uint256 public requiredVerifications = 3;
    uint256 public baseReward = 100 ether; // Base reward in NWU tokens

    // Events
    event ContributionSubmitted(uint256 indexed contributionId, address indexed contributor, string dataHash);
    event ContributionVerified(uint256 indexed contributionId, address indexed verifier);
    event ContributionRewarded(uint256 indexed contributionId, address indexed contributor, uint256 amount);
    event VerifierAdded(address indexed verifier);
    event RequiredVerificationsUpdated(uint256 newCount);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);
    }

    /**
     * @dev Submit a new contribution
     * @param dataHash IPFS hash of the contribution data
     * @param categoryId Category identifier for the contribution
     */
    function submitContribution(string memory dataHash, bytes32 categoryId) 
        external 
        whenNotPaused 
        returns (uint256) 
    {
        contributionCounter++;
        
        contributions[contributionCounter] = Contribution({
            contributor: msg.sender,
            dataHash: dataHash,
            timestamp: block.timestamp,
            rewardAmount: 0,
            status: ContributionStatus.Pending,
            verificationCount: 0,
            categoryId: categoryId
        });

        emit ContributionSubmitted(contributionCounter, msg.sender, dataHash);
        return contributionCounter;
    }

    /**
     * @dev Verify a contribution (verifiers only)
     * @param contributionId ID of the contribution to verify
     */
    function verifyContribution(uint256 contributionId) 
        external 
        onlyRole(VERIFIER_ROLE) 
        whenNotPaused 
    {
        Contribution storage contribution = contributions[contributionId];
        require(contribution.status == ContributionStatus.Pending, "Not pending");
        require(!verifications[contributionId][msg.sender], "Already verified");
        require(contribution.contributor != msg.sender, "Cannot verify own contribution");

        verifications[contributionId][msg.sender] = true;
        contribution.verificationCount++;

        emit ContributionVerified(contributionId, msg.sender);

        // Auto-approve if threshold reached
        if (contribution.verificationCount >= requiredVerifications) {
            contribution.status = ContributionStatus.Verified;
            _calculateAndDistributeReward(contributionId);
        }
    }

    /**
     * @dev Calculate and distribute rewards for verified contribution
     * @param contributionId ID of the contribution
     */
    function _calculateAndDistributeReward(uint256 contributionId) internal {
        Contribution storage contribution = contributions[contributionId];
        
        // Calculate reward based on contributor score and base reward
        uint256 scoreMultiplier = contributorScores[contribution.contributor] / 100 + 1;
        uint256 reward = baseReward * scoreMultiplier;
        
        contribution.rewardAmount = reward;
        contribution.status = ContributionStatus.Rewarded;
        contributorScores[contribution.contributor] += 10; // Increase score

        emit ContributionRewarded(contributionId, contribution.contributor, reward);
    }

    /**
     * @dev Add a new verifier
     * @param verifier Address of the verifier to add
     */
    function addVerifier(address verifier) external onlyRole(GOVERNANCE_ROLE) {
        grantRole(VERIFIER_ROLE, verifier);
        emit VerifierAdded(verifier);
    }

    /**
     * @dev Update required verification count
     * @param newCount New verification threshold
     */
    function updateRequiredVerifications(uint256 newCount) 
        external 
        onlyRole(GOVERNANCE_ROLE) 
    {
        require(newCount > 0, "Must be > 0");
        requiredVerifications = newCount;
        emit RequiredVerificationsUpdated(newCount);
    }

    /**
     * @dev Pause the protocol
     */
    function pause() external onlyRole(GOVERNANCE_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the protocol
     */
    function unpause() external onlyRole(GOVERNANCE_ROLE) {
        _unpause();
    }

    /**
     * @dev Get contribution details
     * @param contributionId ID of the contribution
     */
    function getContribution(uint256 contributionId) 
        external 
        view 
        returns (Contribution memory) 
    {
        return contributions[contributionId];
    }
}