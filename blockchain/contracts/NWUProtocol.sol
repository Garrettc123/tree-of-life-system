// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./NWUToken.sol";
import "./QuantumResistant.sol";

/**
 * @title NWUProtocol
 * @dev Core protocol contract for the NWU Tree of Life System
 * Implements contribution tracking, verification, and reward distribution
 */
contract NWUProtocol is AccessControl, ReentrancyGuard, Pausable, QuantumResistant {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant CONTRIBUTOR_ROLE = keccak256("CONTRIBUTOR_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    NWUToken public nwuToken;

    struct Contribution {
        uint256 id;
        address contributor;
        string dataHash; // IPFS hash or quantum-resistant hash
        string category; // research, medical, financial, environmental, custom
        uint256 timestamp;
        uint256 verificationCount;
        uint256 qualityScore;
        bool verified;
        bool rewarded;
        uint256 rewardAmount;
    }

    struct Verifier {
        address verifierAddress;
        uint256 reputation;
        uint256 totalVerifications;
        uint256 accuracyScore;
        bool active;
    }

    // State variables
    uint256 public contributionCounter;
    uint256 public minVerificationsRequired = 3;
    uint256 public baseRewardAmount = 100 * 10**18; // 100 NWU tokens
    uint256 public verifierRewardPercentage = 10; // 10% of base reward

    mapping(uint256 => Contribution) public contributions;
    mapping(address => Verifier) public verifiers;
    mapping(uint256 => mapping(address => bool)) public hasVerified;
    mapping(address => uint256[]) public contributorSubmissions;
    mapping(string => uint256[]) public categoryContributions;

    // Events
    event ContributionSubmitted(uint256 indexed contributionId, address indexed contributor, string category);
    event ContributionVerified(uint256 indexed contributionId, address indexed verifier, uint256 qualityScore);
    event ContributionApproved(uint256 indexed contributionId, uint256 rewardAmount);
    event RewardDistributed(uint256 indexed contributionId, address indexed contributor, uint256 amount);
    event VerifierRegistered(address indexed verifier);
    event VerifierReputationUpdated(address indexed verifier, uint256 newReputation);

    constructor(address _nwuToken) {
        nwuToken = NWUToken(_nwuToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);
    }

    /**
     * @dev Submit a new contribution to the protocol
     * @param _dataHash IPFS or quantum-resistant hash of the contribution data
     * @param _category Category of the contribution
     */
    function submitContribution(string memory _dataHash, string memory _category) 
        external 
        whenNotPaused 
        returns (uint256) 
    {
        require(bytes(_dataHash).length > 0, "Invalid data hash");
        require(bytes(_category).length > 0, "Invalid category");

        contributionCounter++;
        uint256 contributionId = contributionCounter;

        contributions[contributionId] = Contribution({
            id: contributionId,
            contributor: msg.sender,
            dataHash: _dataHash,
            category: _category,
            timestamp: block.timestamp,
            verificationCount: 0,
            qualityScore: 0,
            verified: false,
            rewarded: false,
            rewardAmount: 0
        });

        contributorSubmissions[msg.sender].push(contributionId);
        categoryContributions[_category].push(contributionId);

        if (!hasRole(CONTRIBUTOR_ROLE, msg.sender)) {
            _grantRole(CONTRIBUTOR_ROLE, msg.sender);
        }

        emit ContributionSubmitted(contributionId, msg.sender, _category);
        return contributionId;
    }

    /**
     * @dev Verify a contribution (only verifiers can call)
     * @param _contributionId ID of the contribution to verify
     * @param _qualityScore Quality score (0-100)
     */
    function verifyContribution(uint256 _contributionId, uint256 _qualityScore) 
        external 
        onlyRole(VERIFIER_ROLE) 
        whenNotPaused 
    {
        require(_contributionId <= contributionCounter, "Invalid contribution ID");
        require(_qualityScore <= 100, "Quality score must be 0-100");
        require(!hasVerified[_contributionId][msg.sender], "Already verified");
        require(!contributions[_contributionId].verified, "Already approved");

        Contribution storage contribution = contributions[_contributionId];
        
        hasVerified[_contributionId][msg.sender] = true;
        contribution.verificationCount++;
        contribution.qualityScore += _qualityScore;

        verifiers[msg.sender].totalVerifications++;

        emit ContributionVerified(_contributionId, msg.sender, _qualityScore);

        // Auto-approve if minimum verifications reached
        if (contribution.verificationCount >= minVerificationsRequired) {
            _approveContribution(_contributionId);
        }
    }

    /**
     * @dev Internal function to approve and reward a contribution
     */
    function _approveContribution(uint256 _contributionId) internal {
        Contribution storage contribution = contributions[_contributionId];
        require(!contribution.verified, "Already approved");

        uint256 avgQualityScore = contribution.qualityScore / contribution.verificationCount;
        contribution.verified = true;
        
        // Calculate reward based on quality score
        uint256 rewardAmount = (baseRewardAmount * avgQualityScore) / 100;
        contribution.rewardAmount = rewardAmount;

        emit ContributionApproved(_contributionId, rewardAmount);
        
        // Distribute rewards
        _distributeRewards(_contributionId);
    }

    /**
     * @dev Distribute rewards to contributor and verifiers
     */
    function _distributeRewards(uint256 _contributionId) internal nonReentrant {
        Contribution storage contribution = contributions[_contributionId];
        require(contribution.verified, "Not verified");
        require(!contribution.rewarded, "Already rewarded");

        uint256 contributorReward = contribution.rewardAmount;
        uint256 verifierRewardPool = (contributorReward * verifierRewardPercentage) / 100;
        uint256 verifierIndividualReward = verifierRewardPool / contribution.verificationCount;

        // Mint tokens for contributor
        nwuToken.mint(contribution.contributor, contributorReward);
        emit RewardDistributed(_contributionId, contribution.contributor, contributorReward);

        // Mint tokens for verifiers
        for (uint256 i = 0; i < contributionCounter; i++) {
            // Note: In production, maintain a list of verifiers for each contribution
            // This is simplified for demonstration
        }

        contribution.rewarded = true;
    }

    /**
     * @dev Register as a verifier
     */
    function registerVerifier() external {
        require(!verifiers[msg.sender].active, "Already registered");
        
        verifiers[msg.sender] = Verifier({
            verifierAddress: msg.sender,
            reputation: 100, // Starting reputation
            totalVerifications: 0,
            accuracyScore: 100, // Starting accuracy
            active: true
        });

        _grantRole(VERIFIER_ROLE, msg.sender);
        emit VerifierRegistered(msg.sender);
    }

    /**
     * @dev Update verifier reputation (governance function)
     */
    function updateVerifierReputation(address _verifier, uint256 _newReputation) 
        external 
        onlyRole(GOVERNANCE_ROLE) 
    {
        require(verifiers[_verifier].active, "Verifier not active");
        verifiers[_verifier].reputation = _newReputation;
        emit VerifierReputationUpdated(_verifier, _newReputation);
    }

    /**
     * @dev Get contributions by contributor
     */
    function getContributorSubmissions(address _contributor) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return contributorSubmissions[_contributor];
    }

    /**
     * @dev Get contributions by category
     */
    function getCategoryContributions(string memory _category) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return categoryContributions[_category];
    }

    /**
     * @dev Get contribution details
     */
    function getContribution(uint256 _contributionId) 
        external 
        view 
        returns (Contribution memory) 
    {
        return contributions[_contributionId];
    }

    /**
     * @dev Update protocol parameters (governance)
     */
    function updateParameters(
        uint256 _minVerifications,
        uint256 _baseReward,
        uint256 _verifierPercentage
    ) external onlyRole(GOVERNANCE_ROLE) {
        minVerificationsRequired = _minVerifications;
        baseRewardAmount = _baseReward;
        verifierRewardPercentage = _verifierPercentage;
    }

    /**
     * @dev Pause the protocol (emergency)
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
}