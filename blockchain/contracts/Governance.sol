// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "./NWUToken.sol";

/**
 * @title NWUGovernance
 * @dev DAO governance contract for the NWU Protocol
 * Allows token holders to propose and vote on protocol changes
 */
contract NWUGovernance is 
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    // Proposal types
    enum ProposalType {
        ParameterChange,
        TreasuryAllocation,
        ProtocolUpgrade,
        PartnershipApproval,
        EmergencyAction
    }

    struct ProposalMetadata {
        ProposalType proposalType;
        string description;
        uint256 createdAt;
        address proposer;
    }

    mapping(uint256 => ProposalMetadata) public proposalMetadata;

    event ProposalCreatedWithMetadata(
        uint256 indexed proposalId,
        ProposalType proposalType,
        address proposer
    );

    constructor(
        IVotes _token,
        TimelockController _timelock
    )
        Governor("NWU Governance")
        GovernorSettings(
            1, /* 1 block voting delay */
            50400, /* 1 week voting period (assuming 12s blocks) */
            1000e18 /* 1000 tokens proposal threshold */
        )
        GovernorVotes(_token)
        GovernorVotesQuorumFraction(4) /* 4% quorum */
        GovernorTimelockControl(_timelock)
    {}

    /**
     * @dev Create a proposal with metadata
     */
    function proposeWithMetadata(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalType proposalType
    ) public returns (uint256) {
        uint256 proposalId = propose(targets, values, calldatas, description);
        
        proposalMetadata[proposalId] = ProposalMetadata({
            proposalType: proposalType,
            description: description,
            createdAt: block.timestamp,
            proposer: msg.sender
        });

        emit ProposalCreatedWithMetadata(proposalId, proposalType, msg.sender);
        return proposalId;
    }

    /**
     * @dev Get proposal metadata
     */
    function getProposalMetadata(uint256 proposalId) 
        external 
        view 
        returns (ProposalMetadata memory) 
    {
        return proposalMetadata[proposalId];
    }

    // Override functions required by Solidity
    function votingDelay()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(IGovernor, GovernorSettings)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    )
        public
        override(Governor, IGovernor)
        returns (uint256)
    {
        return super.propose(targets, values, calldatas, description);
    }

    function proposalThreshold()
        public
        view
        override(Governor, GovernorSettings)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
        internal
        override(Governor, GovernorTimelockControl)
    {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    )
        internal
        override(Governor, GovernorTimelockControl)
        returns (uint256)
    {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}