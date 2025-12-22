import { EventEmitter } from 'events';
import { ethers } from 'ethers';

interface VerificationRequest {
  contributionId: string;
  dataHash: string;
  category: string;
  priority: number;
  requestedAt: number;
}

interface VerificationResult {
  contributionId: string;
  verifier: string;
  qualityScore: number;
  verifiedAt: number;
  confidence: number;
  notes?: string;
}

interface Verifier {
  address: string;
  reputation: number;
  specializations: string[];
  active: boolean;
}

/**
 * VerificationEngine - Manages contribution verification workflow
 * Part of the TRUNK layer: Core business logic
 */
export class VerificationEngine extends EventEmitter {
  private verificationQueue: Map<string, VerificationRequest>;
  private verificationResults: Map<string, VerificationResult[]>;
  private verifiers: Map<string, Verifier>;
  private provider: ethers.providers.Provider;
  private protocolContract: ethers.Contract;
  private minVerifications: number;

  constructor(
    provider: ethers.providers.Provider,
    protocolAddress: string,
    protocolABI: any[],
    minVerifications: number = 3
  ) {
    super();
    this.verificationQueue = new Map();
    this.verificationResults = new Map();
    this.verifiers = new Map();
    this.provider = provider;
    this.minVerifications = minVerifications;
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
      (contributionId, contributor, category) => {
        this.addToVerificationQueue(contributionId, category);
      }
    );

    this.protocolContract.on(
      'VerifierRegistered',
      (verifierAddress) => {
        this.onVerifierRegistered(verifierAddress);
      }
    );
  }

  /**
   * Add contribution to verification queue
   */
  async addToVerificationQueue(
    contributionId: string,
    category: string
  ): Promise<void> {
    try {
      const onChainData = await this.protocolContract.getContribution(contributionId);

      const request: VerificationRequest = {
        contributionId,
        dataHash: onChainData.dataHash,
        category,
        priority: this.calculatePriority(category),
        requestedAt: Date.now(),
      };

      this.verificationQueue.set(contributionId, request);
      this.emit('verificationQueued', request);

      // Assign to available verifiers
      await this.assignVerifiers(request);
    } catch (error) {
      this.emit('error', { type: 'queueing', error });
    }
  }

  /**
   * Calculate verification priority based on category and other factors
   */
  private calculatePriority(category: string): number {
    const categoryPriorities: Record<string, number> = {
      medical: 10,
      research: 8,
      environmental: 7,
      financial: 6,
      custom: 5,
    };

    return categoryPriorities[category.toLowerCase()] || 5;
  }

  /**
   * Assign verifiers to a contribution
   */
  private async assignVerifiers(request: VerificationRequest): Promise<void> {
    const eligibleVerifiers = this.getEligibleVerifiers(request.category);

    // Select top verifiers based on reputation
    const selectedVerifiers = eligibleVerifiers
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, this.minVerifications);

    for (const verifier of selectedVerifiers) {
      this.emit('verificationAssigned', {
        contributionId: request.contributionId,
        verifier: verifier.address,
      });
    }
  }

  /**
   * Get eligible verifiers for a category
   */
  private getEligibleVerifiers(category: string): Verifier[] {
    return Array.from(this.verifiers.values()).filter(
      (v) =>
        v.active &&
        (v.specializations.includes(category) ||
          v.specializations.includes('all'))
    );
  }

  /**
   * Submit verification result
   */
  async submitVerification(
    contributionId: string,
    qualityScore: number,
    signer: ethers.Signer,
    notes?: string
  ): Promise<void> {
    try {
      // Validate quality score
      if (qualityScore < 0 || qualityScore > 100) {
        throw new Error('Quality score must be between 0 and 100');
      }

      const verifierAddress = await signer.getAddress();

      // Check if verifier is registered
      const verifier = this.verifiers.get(verifierAddress);
      if (!verifier || !verifier.active) {
        throw new Error('Verifier not registered or inactive');
      }

      // Submit to blockchain
      const contract = this.protocolContract.connect(signer);
      const tx = await contract.verifyContribution(contributionId, qualityScore);
      await tx.wait();

      // Record verification result
      const result: VerificationResult = {
        contributionId,
        verifier: verifierAddress,
        qualityScore,
        verifiedAt: Date.now(),
        confidence: this.calculateConfidence(verifier),
        notes,
      };

      this.addVerificationResult(contributionId, result);
      this.emit('verificationSubmitted', result);

      // Check if contribution is fully verified
      await this.checkVerificationCompletion(contributionId);
    } catch (error) {
      this.emit('error', { type: 'verification', error });
      throw error;
    }
  }

  /**
   * Calculate confidence score based on verifier reputation
   */
  private calculateConfidence(verifier: Verifier): number {
    return Math.min(100, verifier.reputation);
  }

  /**
   * Add verification result to tracking
   */
  private addVerificationResult(
    contributionId: string,
    result: VerificationResult
  ): void {
    if (!this.verificationResults.has(contributionId)) {
      this.verificationResults.set(contributionId, []);
    }
    this.verificationResults.get(contributionId)!.push(result);
  }

  /**
   * Check if contribution has received enough verifications
   */
  private async checkVerificationCompletion(contributionId: string): Promise<void> {
    const results = this.verificationResults.get(contributionId);
    if (!results || results.length < this.minVerifications) {
      return;
    }

    // Calculate consensus
    const avgScore =
      results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length;
    const variance =
      results.reduce((sum, r) => sum + Math.pow(r.qualityScore - avgScore, 2), 0) /
      results.length;
    const standardDeviation = Math.sqrt(variance);

    const consensus = {
      contributionId,
      averageScore: avgScore,
      standardDeviation,
      verificationCount: results.length,
      verifiers: results.map((r) => r.verifier),
    };

    // Remove from queue
    this.verificationQueue.delete(contributionId);

    this.emit('verificationCompleted', consensus);
  }

  /**
   * Register a new verifier
   */
  async registerVerifier(
    address: string,
    specializations: string[]
  ): Promise<void> {
    const verifier: Verifier = {
      address,
      reputation: 100, // Starting reputation
      specializations,
      active: true,
    };

    this.verifiers.set(address, verifier);
    this.emit('verifierAdded', verifier);
  }

  /**
   * Handle verifier registration event from blockchain
   */
  private async onVerifierRegistered(verifierAddress: string): Promise<void> {
    try {
      const onChainData = await this.protocolContract.verifiers(verifierAddress);
      
      const verifier: Verifier = {
        address: verifierAddress,
        reputation: onChainData.reputation.toNumber(),
        specializations: ['all'], // Default to all categories
        active: onChainData.active,
      };

      this.verifiers.set(verifierAddress, verifier);
      this.emit('verifierRegistered', verifier);
    } catch (error) {
      this.emit('error', { type: 'verifier_registration', error });
    }
  }

  /**
   * Get verification status for a contribution
   */
  getVerificationStatus(contributionId: string): {
    inQueue: boolean;
    verificationCount: number;
    results: VerificationResult[];
  } {
    return {
      inQueue: this.verificationQueue.has(contributionId),
      verificationCount: this.verificationResults.get(contributionId)?.length || 0,
      results: this.verificationResults.get(contributionId) || [],
    };
  }

  /**
   * Get queue statistics
   */
  getQueueStatistics(): {
    queueSize: number;
    averageWaitTime: number;
    activeVerifiers: number;
  } {
    const now = Date.now();
    const waitTimes = Array.from(this.verificationQueue.values()).map(
      (req) => now - req.requestedAt
    );

    return {
      queueSize: this.verificationQueue.size,
      averageWaitTime:
        waitTimes.length > 0
          ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
          : 0,
      activeVerifiers: Array.from(this.verifiers.values()).filter((v) => v.active)
        .length,
    };
  }
}
