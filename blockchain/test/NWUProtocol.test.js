const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("NWUProtocol", function () {
  async function deployProtocolFixture() {
    const [owner, verifier1, verifier2, verifier3, contributor] = await ethers.getSigners();

    // Deploy token
    const NWUToken = await ethers.getContractFactory("NWUToken");
    const token = await NWUToken.deploy("NWU Token", "NWU");

    // Deploy protocol
    const NWUProtocol = await ethers.getContractFactory("NWUProtocol");
    const protocol = await NWUProtocol.deploy(await token.getAddress(), 2);

    // Grant minter role
    const MINTER_ROLE = await token.MINTER_ROLE();
    await token.grantRole(MINTER_ROLE, await protocol.getAddress());

    // Grant verifier roles
    const VERIFIER_ROLE = await protocol.VERIFIER_ROLE();
    await protocol.grantRole(VERIFIER_ROLE, verifier1.address);
    await protocol.grantRole(VERIFIER_ROLE, verifier2.address);
    await protocol.grantRole(VERIFIER_ROLE, verifier3.address);

    return { protocol, token, owner, verifier1, verifier2, verifier3, contributor };
  }

  describe("Deployment", function () {
    it("Should set the right token address", async function () {
      const { protocol, token } = await loadFixture(deployProtocolFixture);
      expect(await protocol.nwuToken()).to.equal(await token.getAddress());
    });

    it("Should set the right verification threshold", async function () {
      const { protocol } = await loadFixture(deployProtocolFixture);
      expect(await protocol.verificationThreshold()).to.equal(2);
    });
  });

  describe("Contributions", function () {
    it("Should allow submitting contributions", async function () {
      const { protocol, contributor } = await loadFixture(deployProtocolFixture);
      
      await expect(
        protocol.connect(contributor).submitContribution(
          "ipfs://test-hash",
          "Test Contribution",
          "Research"
        )
      ).to.emit(protocol, "ContributionSubmitted");
      
      const contribution = await protocol.contributions(0);
      expect(contribution.contributor).to.equal(contributor.address);
      expect(contribution.title).to.equal("Test Contribution");
    });

    it("Should allow verifiers to verify contributions", async function () {
      const { protocol, contributor, verifier1 } = await loadFixture(deployProtocolFixture);
      
      await protocol.connect(contributor).submitContribution(
        "ipfs://test-hash",
        "Test Contribution",
        "Research"
      );
      
      await expect(
        protocol.connect(verifier1).verifyContribution(0, true, "Looks good")
      ).to.emit(protocol, "ContributionVerified");
    });

    it("Should approve contribution after threshold verifications", async function () {
      const { protocol, contributor, verifier1, verifier2 } = await loadFixture(deployProtocolFixture);
      
      await protocol.connect(contributor).submitContribution(
        "ipfs://test-hash",
        "Test Contribution",
        "Research"
      );
      
      await protocol.connect(verifier1).verifyContribution(0, true, "Good");
      await protocol.connect(verifier2).verifyContribution(0, true, "Approved");
      
      const contribution = await protocol.contributions(0);
      expect(contribution.status).to.equal(2); // Approved
    });
  });

  describe("Rewards", function () {
    it("Should distribute rewards after approval", async function () {
      const { protocol, token, contributor, verifier1, verifier2 } = await loadFixture(deployProtocolFixture);
      
      await protocol.connect(contributor).submitContribution(
        "ipfs://test-hash",
        "Test Contribution",
        "Research"
      );
      
      await protocol.connect(verifier1).verifyContribution(0, true, "Good");
      await protocol.connect(verifier2).verifyContribution(0, true, "Approved");
      
      const balance = await token.balanceOf(contributor.address);
      expect(balance).to.be.gt(0);
    });
  });
});