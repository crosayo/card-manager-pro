const fs = require('fs');
const path = require('path');

// 集計から除外するディレクトリ
const ignoreDirs = ['node_modules', '.next', '.git', 'out', 'build', '.vercel'];
// 集計対象の拡張子
const targetExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html'];

const outputFile = 'full_project_code.txt';
let fullText = '';

function collectFiles(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
            if (!ignoreDirs.includes(file)) {
                collectFiles(fullPath);
            }
        } else {
            const ext = path.extname(file);
            if (targetExtensions.includes(ext) && file !== outputFile && file !== 'collect_code.js') {
                const content = fs.readFileSync(fullPath, 'utf8');
                fullText += `--- START OF FILE ${fullPath} ---\n\n${content}\n\n`;
            }
        }
    }
}

console.log("コードの集計を開始します...");
collectFiles('.'); // カレントディレクトリから開始
fs.writeFileSync(outputFile, fullText);
console.log(`完了！ ${outputFile} にすべてのコードがまとまりました。`);