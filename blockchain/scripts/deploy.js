const hre = require("hardhat");

async function main() {
  console.log("\n🌳 Deploying NWU Protocol - Tree of Life System\n");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy NWUToken
  console.log("\n📍 Deploying NWUToken...");
  const NWUToken = await hre.ethers.getContractFactory("NWUToken");
  const nwuToken = await NWUToken.deploy();
  await nwuToken.deployed();
  console.log("✅ NWUToken deployed to:", nwuToken.address);

  // Deploy TimelockController for governance
  console.log("\n📍 Deploying TimelockController...");
  const minDelay = 2 * 24 * 60 * 60; // 2 days
  const TimelockController = await hre.ethers.getContractFactory(
    "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController"
  );
  const timelock = await TimelockController.deploy(
    minDelay,
    [], // proposers (will be set to governance contract)
    [], // executors (will be set to governance contract)
    deployer.address // admin
  );
  await timelock.deployed();
  console.log("✅ TimelockController deployed to:", timelock.address);

  // Deploy Governance
  console.log("\n📍 Deploying NWUGovernance...");
  const Governance = await hre.ethers.getContractFactory("NWUGovernance");
  const governance = await Governance.deploy(nwuToken.address, timelock.address);
  await governance.deployed();
  console.log("✅ NWUGovernance deployed to:", governance.address);

  // Setup timelock roles
  console.log("\n📍 Setting up Timelock roles...");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const TIMELOCK_ADMIN_ROLE = await timelock.TIMELOCK_ADMIN_ROLE();

  await timelock.grantRole(PROPOSER_ROLE, governance.address);
  await timelock.grantRole(EXECUTOR_ROLE, governance.address);
  console.log("✅ Timelock roles configured");

  // Deploy Treasury
  console.log("\n📍 Deploying Treasury...");
  const Treasury = await hre.ethers.getContractFactory("Treasury");
  const treasury = await Treasury.deploy();
  await treasury.deployed();
  console.log("✅ Treasury deployed to:", treasury.address);

  // Deploy NWUProtocol
  console.log("\n📍 Deploying NWUProtocol...");
  const NWUProtocol = await hre.ethers.getContractFactory("NWUProtocol");
  const protocol = await NWUProtocol.deploy(nwuToken.address);
  await protocol.deployed();
  console.log("✅ NWUProtocol deployed to:", protocol.address);

  // Grant minter role to protocol
  console.log("\n📍 Configuring token permissions...");
  const MINTER_ROLE = await nwuToken.MINTER_ROLE();
  await nwuToken.grantRole(MINTER_ROLE, protocol.address);
  console.log("✅ Protocol granted minter role");

  // Grant treasury roles
  console.log("\n📍 Configuring treasury permissions...");
  const ALLOCATOR_ROLE = await treasury.ALLOCATOR_ROLE();
  await treasury.grantRole(ALLOCATOR_ROLE, governance.address);
  console.log("✅ Governance granted allocator role");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("🌳 NWU PROTOCOL DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("\nContract Addresses:");
  console.log("-------------------");
  console.log("NWUToken:", nwuToken.address);
  console.log("TimelockController:", timelock.address);
  console.log("NWUGovernance:", governance.address);
  console.log("Treasury:", treasury.address);
  console.log("NWUProtocol:", protocol.address);
  console.log("\n" + "=".repeat(60));

  // Save deployment addresses
  const fs = require("fs");
  const deploymentInfo = {
    network: hre.network.name,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      NWUToken: nwuToken.address,
      TimelockController: timelock.address,
      NWUGovernance: governance.address,
      Treasury: treasury.address,
      NWUProtocol: protocol.address,
    },
  };

  fs.writeFileSync(
    `./deployments/${hre.network.name}-deployment.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\n✅ Deployment info saved to deployments/${hre.network.name}-deployment.json`);

  // Verification instructions
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n📝 To verify contracts on Etherscan:");
    console.log(`npx hardhat verify --network ${hre.network.name} ${nwuToken.address}`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${timelock.address} ${minDelay} "[]" "[]" ${deployer.address}`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${governance.address} ${nwuToken.address} ${timelock.address}`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${treasury.address}`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${protocol.address} ${nwuToken.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });