const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Recursive function to find .js files
function getJSFiles(dir) {
    let jsFiles = [];
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            jsFiles = jsFiles.concat(getJSFiles(fullPath));
        } else if (file.endsWith('.js') && file !== path.basename(__filename)) { // Ignore this script
            jsFiles.push(fullPath);
        }
    });

    return jsFiles;
}

// Minify all .js files (replace original files)
const jsFiles = getJSFiles('.');
jsFiles.forEach(file => {
    exec(`npx terser ${file} -o ${file} --compress --mangle`, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error processing file ${file}:`, stderr);
        } else {
            console.log(`Minified and replaced: ${file}`);
        }
    });
});
