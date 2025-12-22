const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Starting NWU Protocol Deployment...");
  console.log("Network:", hre.network.name);
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());
  
  const deployedContracts = {};
  
  // Deploy NWUToken
  console.log("\n📝 Deploying NWUToken...");
  const NWUToken = await hre.ethers.getContractFactory("NWUToken");
  const token = await NWUToken.deploy("NWU Token", "NWU");
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("✅ NWUToken deployed to:", tokenAddress);
  deployedContracts.NWUToken = tokenAddress;
  
  // Deploy Treasury
  console.log("\n💰 Deploying Treasury...");
  const Treasury = await hre.ethers.getContractFactory("Treasury");
  const approvalThreshold = 2; // Require 2 approvals
  const treasury = await Treasury.deploy(approvalThreshold);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  console.log("✅ Treasury deployed to:", treasuryAddress);
  deployedContracts.Treasury = treasuryAddress;
  
  // Deploy QuantumResistant
  console.log("\n🔐 Deploying QuantumResistant...");
  const QuantumResistant = await hre.ethers.getContractFactory("QuantumResistant");
  const quantumResistant = await QuantumResistant.deploy();
  await quantumResistant.waitForDeployment();
  const quantumAddress = await quantumResistant.getAddress();
  console.log("✅ QuantumResistant deployed to:", quantumAddress);
  deployedContracts.QuantumResistant = quantumAddress;
  
  // Deploy Governance (Timelock)
  console.log("\n⏱️ Deploying TimelockController...");
  const minDelay = 2 * 24 * 60 * 60; // 2 days
  const proposers = [deployer.address];
  const executors = [deployer.address];
  const admin = deployer.address;
  
  const TimelockController = await hre.ethers.getContractFactory("TimelockController");
  const timelock = await TimelockController.deploy(minDelay, proposers, executors, admin);
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log("✅ TimelockController deployed to:", timelockAddress);
  deployedContracts.TimelockController = timelockAddress;
  
  // Deploy Governance
  console.log("\n🗳️ Deploying Governance...");
  const Governance = await hre.ethers.getContractFactory("Governance");
  const governance = await Governance.deploy(
    tokenAddress,
    timelockAddress,
    "NWU Governor"
  );
  await governance.waitForDeployment();
  const governanceAddress = await governance.getAddress();
  console.log("✅ Governance deployed to:", governanceAddress);
  deployedContracts.Governance = governanceAddress;
  
  // Deploy NWUProtocol
  console.log("\n🌱 Deploying NWUProtocol...");
  const NWUProtocol = await hre.ethers.getContractFactory("NWUProtocol");
  const verificationThreshold = 3; // Require 3 verifications
  const protocol = await NWUProtocol.deploy(
    tokenAddress,
    verificationThreshold
  );
  await protocol.waitForDeployment();
  const protocolAddress = await protocol.getAddress();
  console.log("✅ NWUProtocol deployed to:", protocolAddress);
  deployedContracts.NWUProtocol = protocolAddress;
  
  // Grant minter role to protocol
  console.log("\n🔧 Configuring roles...");
  const MINTER_ROLE = await token.MINTER_ROLE();
  await token.grantRole(MINTER_ROLE, protocolAddress);
  console.log("✅ Granted MINTER_ROLE to NWUProtocol");
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: deployedContracts,
    config: {
      approvalThreshold,
      verificationThreshold,
      timelockDelay: minDelay,
    },
  };
  
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const filename = `${hre.network.name}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("\n📄 Deployment info saved to:", filepath);
  console.log("\n✨ Deployment completed successfully!");
  console.log("\n📋 Contract Addresses:");
  Object.entries(deployedContracts).forEach(([name, address]) => {
    console.log(`   ${name}: ${address}`);
  });
  
  // Verify contracts if on testnet/mainnet
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n⏳ Waiting for block confirmations before verification...");
    await token.deploymentTransaction().wait(6);
    
    console.log("\n🔍 Starting contract verification...");
    try {
      await hre.run("verify:verify", {
        address: tokenAddress,
        constructorArguments: ["NWU Token", "NWU"],
      });
      console.log("✅ NWUToken verified");
    } catch (error) {
      console.log("❌ Error verifying NWUToken:", error.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });