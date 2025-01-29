const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Add version from package.json
const manifest = JSON.parse(fs.readFileSync('manifest.json'));
const package = JSON.parse(fs.readFileSync('package.json'));
manifest.version = package.version;
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4));

// Create dist directory if it doesn't exist
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Create a file to stream archive data to
const output = fs.createWriteStream(path.join(__dirname, 'dist', `qr-code-tooltip-v${package.version}.zip`));
const archive = archiver('zip', {
    zlib: { level: 9 } // Maximum compression
});

// Listen for all archive data to be written
output.on('close', () => {
    console.log(`Archive created: ${archive.pointer()} total bytes`);
});

archive.on('error', (err) => {
    throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Add the distribution files
archive.file('manifest.json', { name: 'manifest.json' });
archive.file('popup.html', { name: 'popup.html' });
archive.file('popup.js', { name: 'popup.js' });
archive.file('styles.css', { name: 'styles.css' });
archive.directory('dist/', 'dist/');
archive.file('icons/icon48.png', { name: 'icons/icon48.png' });
archive.file('icons/icon128.png', { name: 'icons/icon128.png' });

// Finalize the archive
archive.finalize(); 