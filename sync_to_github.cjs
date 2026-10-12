const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ghExe = 'C:\\Users\\pg748\\.gemini\\antigravity\\scratch\\git\\cmd\\gh.exe';
const gitExe = 'C:\\Users\\pg748\\.gemini\\antigravity\\scratch\\git\\cmd\\git.exe';
const repoUrl = 'https://github.com/jevinphysicswallah-ops/jevindiscord.git';
const codeFile = path.join(__dirname, 'github_device_code.txt');

console.log('Initiating GitHub Device Login...');
const p = cp.spawn(ghExe, [
  'auth', 'login',
  '--hostname', 'github.com',
  '--git-protocol', 'https',
  '--web'
], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe']
});

let codeExtracted = false;

function handleOutput(data) {
  const str = data.toString();
  console.log(str);
  
  const match = str.match(/One-time code \(([^)]+)\)/i) || str.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
  if (match && !codeExtracted) {
    codeExtracted = true;
    const code = match[1];
    fs.writeFileSync(codeFile, code, 'utf8');
    console.log('\n======================================================');
    console.log(`🔑 YOUR GITHUB CODE IS: ${code}`);
    console.log(`👉 Open: https://github.com/login/device`);
    console.log('======================================================\n');
    
    // Automatically open browser for the user
    try {
      cp.exec('start "" "https://github.com/login/device"');
    } catch (e) {}
    
    // Send newline to gh CLI if prompted
    setTimeout(() => {
      try {
        p.stdin.write('\n');
      } catch (e) {}
    }, 1500);
  }
}

p.stdout.on('data', handleOutput);
p.stderr.on('data', handleOutput);

p.on('close', (exitCode) => {
  if (exitCode === 0) {
    console.log('\n✅ GitHub authentication successful!');
    console.log('Configuring git credentials...');
    try {
      cp.execSync(`"${ghExe}" auth setup-git`, { cwd: __dirname, stdio: 'inherit' });
    } catch (e) {
      console.warn('gh auth setup-git warning:', e.message);
    }

    console.log(`Pushing code to ${repoUrl}...`);
    try {
      cp.execSync(`"${gitExe}" push -u origin main`, { cwd: __dirname, stdio: 'inherit' });
      console.log('\n======================================================');
      console.log('🎉 SUCCESS! ALL YOUR CODE IS STORED ON GITHUB AT:');
      console.log('https://github.com/jevinphysicswallah-ops/jevindiscord');
      console.log('======================================================\n');
    } catch (err) {
      console.error('Push error:', err.message);
    }
  } else {
    console.error(`gh auth login process exited with code ${exitCode}`);
  }
});
