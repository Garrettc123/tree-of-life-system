require('dotenv').config();
const https = require('https');

async function listTasks() {
  const query = `
    query {
      issues(first: 20, orderBy: createdAt) {
        nodes {
          id
          identifier
          title
          createdAt
          state {
            name
          }
          assignee {
            name
          }
        }
      }
    }
  `;

  const postData = JSON.stringify({ query });

  const options = {
    hostname: 'api.linear.app',
    path: '/graphql',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.LINEAR_API_KEY,
      'Content-Length': postData.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.errors) {
            reject(new Error(result.errors[0].message));
          } else {
            resolve(result.data);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('\n📋 Recent Linear Issues:\n');
  
  const data = await listTasks();
  const issues = data.issues.nodes;

  issues.forEach(issue => {
    const created = new Date(issue.createdAt).toLocaleString();
    const assignee = issue.assignee?.name || 'Unassigned';
    
    console.log(`${issue.identifier}: ${issue.title}`);
    console.log(`   Created: ${created}`);
    console.log(`   Status: ${issue.state?.name || 'Unknown'}`);
    console.log(`   Assignee: ${assignee}`);
    console.log('');
  });

  console.log(`Total: ${issues.length} issues\n`);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
