# Development Agent

## Overview

The Development Agent is an autonomous AI system that generates production-ready code from Linear issue specifications. It handles the complete development workflow from planning to pull request creation.

## Features

### 🤖 Autonomous Code Generation
- Generates multi-file implementations from issue descriptions
- Applies enterprise design patterns and best practices
- Creates comprehensive documentation and inline comments
- Generates unit tests with >80% coverage targets

### 🔄 Complete Workflow Automation
1. **Issue Analysis**: Parses Linear issues for technical specifications
2. **Planning**: Generates implementation plan with file structure
3. **Code Generation**: Creates production-ready code using GPT-4
4. **Repository Management**: Creates branches and commits code
5. **Pull Request**: Opens PR with detailed description
6. **Code Review**: Requests automated review from GitHub Copilot
7. **Issue Updates**: Updates Linear with progress and PR links

### 🎯 Integration Capabilities
- **GitHub**: Branch creation, file commits, PR management
- **Linear**: Issue parsing, status updates, comments
- **OpenAI**: GPT-4 powered code generation
- **GitHub Copilot**: Automated code review requests

## Architecture

```
src/agents/development/
├── index.js              # Main DevelopmentAgent class
├── README.md             # This file
└── config.example.json   # Configuration template

src/services/
├── code-generator.js     # OpenAI GPT-4 integration
├── github.js             # GitHub API wrapper
└── linear.js             # Linear API wrapper
```

## Configuration

```javascript
const agent = new DevelopmentAgent({
  github: {
    token: process.env.GITHUB_TOKEN,
    owner: 'your-username',
    repo: 'your-repo',
    baseBranch: 'main'
  },
  linear: {
    apiKey: process.env.LINEAR_API_KEY
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    temperature: 0.2
  }
});
```

## Usage

### Handle Linear Webhook Event

```javascript
const event = {
  action: 'created',
  issue: {
    id: 'issue-uuid',
    identifier: 'GAR-259',
    title: 'Implement user authentication',
    description: '## Requirements\n- JWT token generation\n- Password hashing with bcrypt\n- Login/logout endpoints',
    priority: 1,
    estimate: 5,
    labels: [{ name: 'feature' }],
    url: 'https://linear.app/...'
  }
};

const result = await agent.handleIssueEvent(event);

console.log(result);
// {
//   success: true,
//   pr: {
//     number: 42,
//     url: 'https://github.com/.../pull/42',
//     branch: 'feature/gar-259'
//   },
//   filesGenerated: 3,
//   commits: 3
// }
```

### Custom Code Generation

```javascript
const specs = await agent.parseIssueSpecs(issue);
const plan = await agent.codeGenerator.generatePlan(specs);
const code = await agent.codeGenerator.generateCode({
  path: 'src/auth.js',
  description: 'Authentication module',
  type: 'class',
  context: plan.context,
  issueSpecs: specs
});
```

## Issue Specification Requirements

For optimal code generation, Linear issues should include:

### ✅ Required Elements
- **Clear Title**: Concise feature or bug description
- **Technical Description**: Implementation details and requirements
- **Acceptance Criteria**: Success conditions for the implementation

### 📈 Recommended Elements
- **Code Examples**: Sample code or API interfaces
- **Architecture Notes**: Design patterns or structural requirements
- **Dependencies**: Related issues or external libraries
- **Constraints**: Performance, security, or compatibility requirements

### Example Well-Specified Issue

```markdown
## 🎯 Objective
Implement user authentication system with JWT tokens

## 📋 Requirements
- JWT token generation with 24h expiration
- Password hashing using bcrypt (10 rounds)
- Login endpoint: POST /api/auth/login
- Logout endpoint: POST /api/auth/logout
- Middleware for protected routes

## 🏗️ Technical Specifications

```javascript
// Expected API interface
class AuthService {
  async login(email, password) { ... }
  async logout(token) { ... }
  async validateToken(token) { ... }
}
```

## ✅ Acceptance Criteria
- Login returns JWT token on valid credentials
- Invalid credentials return 401 error
- Token validation works for protected routes
- Passwords never stored in plaintext
```

## Performance Metrics

| Metric | Target | Current |
|--------|--------|----------|
| Generation Speed | <60s per feature | TBD |
| Code Quality Score | >8.5/10 | TBD |
| First-Time Success | >90% | TBD |
| PR Approval Rate | >85% | TBD |

## Error Handling

The agent includes comprehensive error handling:

- **Insufficient Specs**: Returns `{ success: false, reason: 'insufficient_specs' }`
- **Generation Failures**: Posts error comment to Linear issue
- **GitHub API Errors**: Logs error and attempts rollback
- **OpenAI API Errors**: Falls back to minimal implementation

## Testing

```bash
# Run unit tests
npm test src/agents/development

# Run integration tests
npm test test/integration/development-agent

# Test with mock Linear webhook
node scripts/test-development-agent.js
```

## Monitoring & Logging

All operations are logged with structured metadata:

```javascript
[DevelopmentAgent] Processing created event for GAR-259
[DevelopmentAgent] Generating implementation plan for GAR-259
[DevelopmentAgent] Creating branch: feature/gar-259
[DevelopmentAgent] Generating 3 files
[DevelopmentAgent] Committed src/auth.js
[DevelopmentAgent] Creating pull request
[DevelopmentAgent] Requested Copilot review for PR #42
[DevelopmentAgent] Updated Linear issue GAR-259 with PR link
```

## Roadmap

### Phase 2 (Current)
- [x] Core infrastructure
- [x] GitHub integration
- [x] Linear integration
- [x] OpenAI code generation
- [ ] Unit test generation
- [ ] Integration tests
- [ ] Production deployment

### Phase 3 (Future)
- [ ] Multi-repository support
- [ ] Custom code templates
- [ ] Learning from merged PRs
- [ ] Automatic bug fixing
- [ ] Performance optimization

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

MIT - See [LICENSE](../../LICENSE) for details.
