# GitHub Copilot Instructions for Tree of Life System

## Project Overview

**TITAN: Tree of Life Total Autonomous Intelligence Network** is a comprehensive blockchain-based protocol for contribution management, verification, and reward distribution using the Tree of Life architectural metaphor.

### Technology Stack

#### Blockchain Layer (🌱 ROOT)
- Solidity ^0.8.20
- Hardhat 2.19+
- OpenZeppelin Contracts 5.0+
- Ethers.js 6.9+

#### Backend/Orchestrator (🪵 TRUNK)
- Node.js >= 18.0.0
- Express.js 4.18+
- JavaScript (ES6+)

#### Testing
- Hardhat test framework for smart contracts
- Chai for assertions
- Jest for Node.js components

#### Development Tools
- npm >= 9.0.0
- Git

## Architecture

The system follows a "Tree of Life" architecture with distinct layers:
- **ROOT (🌱)**: Blockchain foundation with smart contracts
- **TRUNK (🪵)**: Core business logic and orchestration
- **BRANCHES (🌿)**: Domain-specific modules (Research, Medical, Financial, Environmental)
- **LEAVES (🍃)**: User-facing applications
- **ATMOSPHERE (💨)**: Integration layer
- **NERVOUS SYSTEM (🧠)**: AI agent network
- **ECOSYSTEM (🌍)**: External partnerships

## Coding Standards

### Solidity Conventions

1. **Version and License**
   - Always use `// SPDX-License-Identifier: MIT`
   - Use Solidity version `^0.8.20`

2. **Style Guide**
   - Follow the [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
   - Use OpenZeppelin contracts for standard implementations
   - Inherit from OpenZeppelin security contracts (AccessControl, ReentrancyGuard, Pausable)

3. **Naming Conventions**
   - Contracts: PascalCase (e.g., `NWUProtocol`, `NWUToken`)
   - Functions: camelCase (e.g., `submitContribution`, `verifyContribution`)
   - Constants: SCREAMING_SNAKE_CASE (e.g., `VERIFIER_ROLE`, `GOVERNANCE_ROLE`)
   - State variables: camelCase (e.g., `contributionCounter`, `baseReward`)
   - Events: PascalCase (e.g., `ContributionSubmitted`, `ContributionVerified`)

4. **Documentation**
   - Use NatSpec comments for all public/external functions
   - Include `@dev`, `@param`, and `@return` tags
   - Document all events and state variables

5. **Security Patterns**
   - Use ReentrancyGuard for functions that transfer tokens
   - Implement Pausable for emergency stops
   - Use AccessControl for role-based permissions
   - Validate inputs with require statements
   - Emit events for all state changes

6. **Testing**
   - Write comprehensive tests using Hardhat
   - Use fixtures for test setup (`loadFixture`)
   - Test both success and failure cases
   - Maintain >90% test coverage

### JavaScript/Node.js Conventions

1. **Style**
   - Use modern ES6+ syntax
   - Use `const` for constants, `let` for variables (avoid `var`)
   - Use arrow functions for callbacks and short functions
   - Use async/await for asynchronous operations

2. **Naming Conventions**
   - Files: kebab-case (e.g., `github-handler.js`, `pr-manager.js`)
   - Variables and functions: camelCase (e.g., `prManager`, `handleWebhook`)
   - Constants: SCREAMING_SNAKE_CASE for true constants (e.g., `PORT`, `API_KEY`)
   - Classes: PascalCase (e.g., `GithubHandler`)

3. **Documentation**
   - Use JSDoc comments for functions and modules
   - Include file-level comments describing module purpose
   - Document complex logic inline

4. **Error Handling**
   - Use try-catch blocks for async operations
   - Log errors with descriptive messages
   - Return appropriate HTTP status codes in API endpoints

5. **Security**
   - Never commit secrets or API keys
   - Use environment variables for sensitive data
   - Validate and sanitize all inputs
   - Use helmet and cors middleware for Express apps

## Build and Test Commands

### Blockchain/Smart Contracts

```bash
cd blockchain

# Compile contracts
npm run compile

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests with gas reporting
npm run test:gas

# Deploy to local network
npm run node          # Terminal 1
npm run deploy:local  # Terminal 2

# Deploy to testnet
npm run deploy:sepolia
npm run deploy:mumbai

# Verify contracts
npm run verify:sepolia
npm run verify:mumbai

# Clean artifacts
npm run clean
```

### Orchestrator/Backend

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start

# Run tests
npm test

# Run linter
npm run lint

# Deploy to Railway
npm run deploy
```

## Project Structure Reference

```
tree-of-life-system/
├── blockchain/              # Smart contracts (Solidity)
├── orchestrator/           # Main orchestration system (Node.js)
├── branch-systems/         # Domain modules
├── trunk/                  # Core business logic
├── leaves/                 # User applications
├── atmosphere/             # Integration layer
├── nervous-system/        # AI agents
├── ecosystem/              # External integrations
├── docs/                   # Documentation
├── scripts/                # Utility scripts
└── tests/                  # Tests
```

## Key Files and Directories

- `blockchain/contracts/`: Smart contract source code
- `blockchain/test/`: Smart contract tests
- `orchestrator/index.js`: Main orchestrator entry point
- `branch-systems/`: Domain-specific modules
- `docs/ARCHITECTURE.md`: Architecture documentation
- `docs/DEPLOYMENT.md`: Deployment guide

## Contributing Guidelines

1. **Branching**
   - Use descriptive branch names (e.g., `feature/add-verification`, `fix/reward-calculation`)
   - Keep branches focused on a single feature or fix

2. **Commits**
   - Write clear, descriptive commit messages
   - Use present tense ("Add feature" not "Added feature")
   - Reference issue numbers when applicable

3. **Pull Requests**
   - Ensure all tests pass before submitting
   - Update documentation for API changes
   - Keep PRs focused and reasonably sized

4. **Testing Requirements**
   - Write tests for all new functionality
   - Maintain >90% code coverage for smart contracts
   - Test both success and failure paths

## Security Considerations

1. **Smart Contracts**
   - All contracts must be auditable
   - Use quantum-resistant cryptography where applicable
   - Implement timelock for critical operations
   - Use multi-signature wallets for treasury management

2. **Backend**
   - Validate all user inputs
   - Use parameterized queries to prevent injection
   - Implement rate limiting
   - Log security-relevant events

3. **Access Control**
   - Use role-based access control (RBAC)
   - Follow principle of least privilege
   - Verify permissions before sensitive operations

## Common Patterns

### Smart Contract Pattern
```solidity
function operationName(uint256 param1, address param2)
    external
    onlyRole(ROLE_NAME)
    whenNotPaused
    nonReentrant
    returns (uint256)
{
    // Validate inputs
    require(param1 > 0, "Invalid param1");
    require(param2 != address(0), "Invalid address");
    
    // Perform operation
    // ...
    
    // Emit event
    emit OperationCompleted(param1, param2);
    
    return result;
}
```

### Express Route Pattern
```javascript
app.post('/endpoint', async (req, res) => {
  try {
    // Validate input
    const { param1, param2 } = req.body;
    if (!param1 || !param2) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    
    // Perform operation
    const result = await performOperation(param1, param2);
    
    // Return success
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

## Documentation Standards

- Keep README.md up to date with project changes
- Document all API endpoints and smart contract functions
- Update architecture docs when adding new components
- Include code examples in documentation
- Maintain deployment guides for all environments

## Token Economics

- Base reward: 100 NWU per verified contribution
- Quality multiplier: 0-1x based on verification scores
- Verifier rewards: 10% of contributor rewards
- Total supply: 1,000,000,000 NWU

## Deployment Notes

- Use `.env` files for environment-specific configuration
- Never commit `.env` files (they're in `.gitignore`)
- Copy `.env.example` to `.env` and fill in values
- Test deployments on testnet before mainnet
- Verify contracts on Etherscan/block explorers after deployment
