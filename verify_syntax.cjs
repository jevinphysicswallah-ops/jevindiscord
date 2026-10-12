const fs = require('fs');

console.log('--- Checking server.cjs syntax ---');
try {
  new Function(fs.readFileSync('./server.cjs', 'utf8'));
  console.log('server.cjs syntax OK');
} catch (e) {
  console.error('server.cjs syntax error:', e);
}

console.log('--- Checking index.html script tag syntax ---');
const html = fs.readFileSync('./index.html', 'utf8');
const scriptMatch = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error('Could not find script tag in index.html');
} else {
  const code = scriptMatch[1];
  console.log(`Script length: ${code.length} chars`);
  
  // Basic brace matching
  const stack = [];
  const lines = code.split('\n');
  let inString = false;
  let stringChar = '';
  let inComment = false;
  
  // Test compiling JSX-free constructs or checking brackets
  let openBraces = (code.match(/{/g) || []).length;
  let closeBraces = (code.match(/}/g) || []).length;
  console.log(`Open braces: ${openBraces}, Close braces: ${closeBraces}`);
  
  let openParens = (code.match(/\(/g) || []).length;
  let closeParens = (code.match(/\)/g) || []).length;
  console.log(`Open parens: ${openParens}, Close parens: ${closeParens}`);
  
  let openBrackets = (code.match(/\[/g) || []).length;
  let closeBrackets = (code.match(/\]/g) || []).length;
  console.log(`Open brackets: ${openBrackets}, Close brackets: ${closeBrackets}`);
  
  if (openBraces === closeBraces && openParens === closeParens && openBrackets === closeBrackets) {
    console.log('✅ ALL DELIMITERS BALANCED PERFECTLY!');
  } else {
    console.warn('⚠️ Delimiter discrepancy detected');
  }
}
