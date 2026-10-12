const fs = require('fs');
const html = fs.readFileSync('auth_app_dom.html', 'utf8');

console.log('Includes jadu?', html.includes('jadu'));
console.log('Includes Voice Lounge?', html.includes('Voice Lounge'));
console.log('Includes DiscordVoiceStage or clyde?', html.includes('DiscordClydeLogo') || html.includes('127.14 96.36'));
console.log('Includes Error?', html.includes('Error:') || html.includes('Uncaught'));

// Check for any console errors that might have been outputted in the page
const errors = html.match(/Error:.*$/gm);
if (errors) {
  console.log('Errors found in HTML:', errors);
} else {
  console.log('No errors in rendered HTML!');
}
