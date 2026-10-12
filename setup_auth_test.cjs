const fs = require('fs');

// We will modify a temporary copy of index.html that auto-sets the token in localStorage before React mounts
const html = fs.readFileSync('index.html', 'utf8');
const tokenInjection = `<script>localStorage.setItem('nexus_session_token', '4f45a583dfc327271de61f005cea70cc4d7cb72f39ca059b8352b813123f1e7d');</script>`;
const modifiedHtml = html.replace('<div id="root"></div>', tokenInjection + '<div id="root"></div>');

fs.writeFileSync('test_auth_app.html', modifiedHtml);
console.log('test_auth_app.html created. Now rendering with Edge...');
