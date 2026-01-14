// Real GitHub integration version
const { Octokit } = require("@octokit/rest");

class DevelopmentAgentGitHub {
  constructor(config) {
    this.octokit = new Octokit({
      auth: config.githubToken
    });
    this.owner = config.githubOwner;
  }

  async createFileInGitHub(repo, path, content, commitMessage) {
    console.log(`📤 Pushing ${path} to GitHub...`);
    
    await this.octokit.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: repo,
      path: path,
      message: commitMessage,
      content: Buffer.from(content).toString('base64')
    });
    
    console.log(`✅ Pushed ${path}`);
  }
}

module.exports = DevelopmentAgentGitHub;
