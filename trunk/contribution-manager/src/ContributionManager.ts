import { EventEmitter } from 'events';
import { ethers } from 'ethers';

interface Contribution {
  id: string;
  contributor: string;
  dataHash: string;
  category: string;
  timestamp: number;
  verificationStatus: 'pending' | 'in-progress' | 'verified' | 'rejected';
  qualityScore?: number;
  metadata: Record<string, any>;
}

interface ContributionSubmission {
  dataHash: string;
  category: string;
  metadata: Record<string, any>;
  signature?: string;
}

/**
 * ContributionManager - Core service for managing contributions
 * Part of the TRUNK layer: Core business logic
 */
export class ContributionManager extends EventEmitter {
  private contributions: Map<string, Contribution>;
  private contributorIndex: Map<string, Set<string>>;
  private categoryIndex: Map<string, Set<string>>;
  private provider: ethers.providers.Provider;
  private protocolContract: ethers.Contract;

  constructor(
    provider: ethers.providers.Provider,
    protocolAddress: string,
    protocolABI: any[]
  ) {
    super();
    this.contributions = new Map();
    this.contributorIndex = new Map();
    this.categoryIndex = new Map();
    this.provider = provider;
    this.protocolContract = new ethers.Contract(
      protocolAddress,
      protocolABI,
      provider
    );

    this.initializeEventListeners();
  }

  /**
   * Initialize blockchain event listeners
   */
  private initializeEventListeners(): void {
    this.protocolContract.on(
      'ContributionSubmitted',
      (contributionId, contributor, category, event) => {
        this.handleContributionSubmitted(contributionId, contributor, category, event);
      }
    );

    this.protocolContract.on(
      'ContributionVerified',
      (contributionId, verifier, qualityScore, event) => {
        this.handleContributionVerified(contributionId, verifier, qualityScore, event);
      }
    );
  }

  /**
   * Submit a new contribution
   */
  async submitContribution(
    submission: ContributionSubmission,
    signer: ethers.Signer
  ): Promise<string> {
    try {
      // Validate submission
      this.validateSubmission(submission);

      // Submit to blockchain
      const contract = this.protocolContract.connect(signer);
      const tx = await contract.submitContribution(
        submission.dataHash,
        submission.category
      );

      const receipt = await tx.wait();
      const event = receipt.events?.find(
        (e: any) => e.event === 'ContributionSubmitted'
      );

      const contributionId = event?.args?.contributionId.toString();

      // Store in local index
      const contribution: Contribution = {
        id: contributionId,
        contributor: await signer.getAddress(),
        dataHash: submission.dataHash,
        category: submission.category,
        timestamp: Date.now(),
        verificationStatus: 'pending',
        metadata: submission.metadata,
      };

      this.indexContribution(contribution);
      this.emit('contributionSubmitted', contribution);

      return contributionId;
    } catch (error) {
      this.emit('error', { type: 'submission', error });
      throw error;
    }
  }

  /**
   * Validate contribution submission
   */
  private validateSubmission(submission: ContributionSubmission): void {
    if (!submission.dataHash || submission.dataHash.length < 32) {
      throw new Error('Invalid data hash');
    }

    if (!submission.category || submission.category.trim().length === 0) {
      throw new Error('Invalid category');
    }

    const validCategories = [
      'research',
      'medical',
      'financial',
      'environmental',
      'custom',
    ];

    if (!validCategories.includes(submission.category.toLowerCase())) {
      throw new Error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }
  }

  /**
   * Index contribution for efficient retrieval
   */
  private indexContribution(contribution: Contribution): void {
    this.contributions.set(contribution.id, contribution);

    // Index by contributor
    if (!this.contributorIndex.has(contribution.contributor)) {
      this.contributorIndex.set(contribution.contributor, new Set());
    }
    this.contributorIndex.get(contribution.contributor)!.add(contribution.id);

    // Index by category
    if (!this.categoryIndex.has(contribution.category)) {
      this.categoryIndex.set(contribution.category, new Set());
    }
    this.categoryIndex.get(contribution.category)!.add(contribution.id);
  }

  /**
   * Get contribution by ID
   */
  async getContribution(id: string): Promise<Contribution | null> {
    // Check local cache first
    if (this.contributions.has(id)) {
      return this.contributions.get(id)!;
    }

    // Fetch from blockchain
    try {
      const onChainData = await this.protocolContract.getContribution(id);
      const contribution: Contribution = {
        id: onChainData.id.toString(),
        contributor: onChainData.contributor,
        dataHash: onChainData.dataHash,
        category: onChainData.category,
        timestamp: onChainData.timestamp.toNumber() * 1000,
        verificationStatus: onChainData.verified ? 'verified' : 'pending',
        qualityScore: onChainData.qualityScore.toNumber(),
        metadata: {},
      };

      this.indexContribution(contribution);
      return contribution;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get contributions by contributor
   */
  getContributionsByContributor(contributor: string): Contribution[] {
    const contributionIds = this.contributorIndex.get(contributor);
    if (!contributionIds) return [];

    return Array.from(contributionIds)
      .map((id) => this.contributions.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get contributions by category
   */
  getContributionsByCategory(category: string): Contribution[] {
    const contributionIds = this.categoryIndex.get(category);
    if (!contributionIds) return [];

    return Array.from(contributionIds)
      .map((id) => this.contributions.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get pending contributions (awaiting verification)
   */
  getPendingContributions(): Contribution[] {
    return Array.from(this.contributions.values()).filter(
      (c) => c.verificationStatus === 'pending' || c.verificationStatus === 'in-progress'
    );
  }

  /**
   * Handle blockchain event: ContributionSubmitted
   */
  private handleContributionSubmitted(
    contributionId: any,
    contributor: string,
    category: string,
    event: any
  ): void {
    const contribution: Contribution = {
      id: contributionId.toString(),
      contributor,
      category,
      dataHash: '',
      timestamp: Date.now(),
      verificationStatus: 'pending',
      metadata: {},
    };

    this.indexContribution(contribution);
    this.emit('contributionIndexed', contribution);
  }

  /**
   * Handle blockchain event: ContributionVerified
   */
  private handleContributionVerified(
    contributionId: any,
    verifier: string,
    qualityScore: any,
    event: any
  ): void {
    const id = contributionId.toString();
    const contribution = this.contributions.get(id);

    if (contribution) {
      contribution.verificationStatus = 'in-progress';
      contribution.qualityScore = qualityScore.toNumber();
      this.emit('contributionVerified', { contribution, verifier });
    }
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    total: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const contribution of this.contributions.values()) {
      byStatus[contribution.verificationStatus] =
        (byStatus[contribution.verificationStatus] || 0) + 1;
      byCategory[contribution.category] =
        (byCategory[contribution.category] || 0) + 1;
    }

    return {
      total: this.contributions.size,
      byCategory,
      byStatus,
    };
  }
}
