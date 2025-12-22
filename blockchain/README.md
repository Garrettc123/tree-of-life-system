# 🌳 NWU Protocol - Blockchain Layer

This directory contains the smart contracts and blockchain infrastructure for the NWU Protocol Tree of Life System.

## 🌱 ROOT LAYER: Smart Contracts

### Core Contracts

- **NWUProtocol.sol** - Main protocol contract for contribution management and verification
- **NWUToken.sol** - ERC20 governance and utility token with voting capabilities
- **Governance.sol** - DAO governance system for protocol decisions
- **Treasury.sol** - Treasury management and fund allocation
- **QuantumResistant.sol** - Quantum-resistant cryptographic primitives

## 📦 Installation

```bash
cd blockchain
npm install
```

## 🔧 Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your environment variables:
- `PRIVATE_KEY`: Your deployment wallet private key
- `INFURA_KEY`: Your Infura project ID
- `ETHERSCAN_API_KEY`: For contract verification

## 🚀 Deployment

### Local Development

1. Start local Hardhat node:
```bash
npm run node
```

2. Deploy contracts:
```bash
npm run deploy:localhost
```

### Testnet Deployment (Sepolia)

```bash
npm run deploy:sepolia
```

### Mainnet Deployment

```bash
npm run deploy:mainnet
```

## 🧪 Testing

Run all tests:
```bash
npm test
```

Run with coverage:
```bash
npm run coverage
```

## 🔍 Contract Verification

After deployment, verify contracts on Etherscan:

```bash
npx hardhat verify --network <network> <contract-address> <constructor-args>
```

## 📋 Contract Features

### NWUProtocol
- Contribution submission and tracking
- Multi-verifier verification system
- Automated reward distribution
- Quality scoring mechanism
- Category-based organization
- Verifier reputation system

### NWUToken
- ERC20 standard compliance
- Governance voting (ERC20Votes)
- Token vesting schedules
- Burnable functionality
- Pausable for emergencies
- Role-based access control

### Governance
- Proposal creation and voting
- Timelock for security
- Quorum requirements
- Multiple proposal types
- On-chain execution

### Treasury
- Multi-token support
- Budget management
- Time-locked allocations
- Emergency withdrawal
- Governance-controlled

## 🔐 Security Features

- Quantum-resistant cryptography
- Reentrancy guards
- Pausable contracts
- Role-based access control
- Timelock for critical operations
- Byzantine fault tolerance

## 🌐 Supported Networks

- Ethereum Mainnet
- Ethereum Sepolia (Testnet)
- Polygon
- Arbitrum
- Optimism
- Local Hardhat Network

## 📊 Gas Optimization

- Optimized storage patterns
- Efficient loops and mappings
- Minimal external calls
- Batch operations support

## 🤝 Contributing

See the main repository README for contribution guidelines.

## 📄 License

MIT License - see LICENSE file for details
