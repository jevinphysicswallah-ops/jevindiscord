const fs = require('fs');

async function test() {
  await import('./vendor/babel.min.js');
  const b = globalThis.Babel;
  const html = fs.readFileSync('./index.html', 'utf8');
  const match = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
  if (!match) {
    console.error('No script found');
    return;
  }
  const code = match[1];
  try {
    const res = b.transform(code, { presets: ['react'] });
    console.log('✅ BABEL COMPILED SUCCESSFULLY! Output length:', res.code.length);
  } catch (err) {
    console.error('❌ Babel compile error:', err.message);
    if (err.loc) console.error('Error Location:', err.loc);
  }
}

test();
