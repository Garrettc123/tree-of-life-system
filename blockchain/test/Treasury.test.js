const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Treasury", function () {
  async function deployTreasuryFixture() {
    const [owner, admin, approver1, approver2, recipient] = await ethers.getSigners();

    const Treasury = await ethers.getContractFactory("Treasury");
    const treasury = await Treasury.deploy(2);

    const APPROVER_ROLE = await treasury.APPROVER_ROLE();
    await treasury.grantRole(APPROVER_ROLE, approver1.address);
    await treasury.grantRole(APPROVER_ROLE, approver2.address);

    // Fund treasury
    await owner.sendTransaction({
      to: await treasury.getAddress(),
      value: ethers.parseEther("10.0"),
    });

    return { treasury, owner, admin, approver1, approver2, recipient };
  }

  describe("Deployment", function () {
    it("Should set the right approval threshold", async function () {
      const { treasury } = await loadFixture(deployTreasuryFixture);
      expect(await treasury.approvalThreshold()).to.equal(2);
    });

    it("Should receive funds", async function () {
      const { treasury } = await loadFixture(deployTreasuryFixture);
      const balance = await ethers.provider.getBalance(await treasury.getAddress());
      expect(balance).to.equal(ethers.parseEther("10.0"));
    });
  });

  describe("Withdrawals", function () {
    it("Should allow requesting withdrawal", async function () {
      const { treasury, owner, recipient } = await loadFixture(deployTreasuryFixture);
      
      await expect(
        treasury.requestWithdrawal(
          recipient.address,
          ethers.parseEther("1.0"),
          "Payment for services"
        )
      ).to.emit(treasury, "WithdrawalRequested");
    });

    it("Should execute withdrawal after approvals", async function () {
      const { treasury, owner, approver1, approver2, recipient } = await loadFixture(deployTreasuryFixture);
      
      await treasury.requestWithdrawal(
        recipient.address,
        ethers.parseEther("1.0"),
        "Payment"
      );
      
      const balanceBefore = await ethers.provider.getBalance(recipient.address);
      
      await treasury.connect(approver1).approveWithdrawal(0);
      await treasury.connect(approver2).approveWithdrawal(0);
      
      const balanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1.0"));
    });
  });

  describe("Budget Management", function () {
    it("Should allow allocating budget", async function () {
      const { treasury, owner } = await loadFixture(deployTreasuryFixture);
      
      await expect(
        treasury.allocateBudget(
          "Development",
          ethers.parseEther("5.0"),
          30 * 24 * 60 * 60 // 30 days
        )
      ).to.emit(treasury, "BudgetAllocated");
      
      const budget = await treasury.getBudget(0);
      expect(budget.category).to.equal("Development");
      expect(budget.allocated).to.equal(ethers.parseEther("5.0"));
    });
  });
});