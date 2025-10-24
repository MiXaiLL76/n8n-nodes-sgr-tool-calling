/**
 * Script to obfuscate JavaScript files in dist folder
 * This makes the code harder to read and reverse-engineer
 */
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Configuration for obfuscation
// Balance between protection and performance
const obfuscationOptions = {
	// String encoding
	stringArray: true,
	stringArrayEncoding: ['base64'],
	stringArrayThreshold: 0.75,

	// Control flow flattening (makes code logic harder to follow)
	controlFlowFlattening: true,
	controlFlowFlatteningThreshold: 0.5,

	// Dead code injection (adds fake code)
	deadCodeInjection: true,
	deadCodeInjectionThreshold: 0.2,

	// Variable name obfuscation
	identifierNamesGenerator: 'hexadecimal',
	renameGlobals: false, // Don't rename globals (n8n needs them)

	// Compact code (remove whitespace)
	compact: true,

	// Self-defending (breaks if someone tries to beautify)
	selfDefending: false, // Can cause issues with n8n, disable if needed

	// Debug protection (slows down debuggers)
	debugProtection: false, // Disable for n8n compatibility

	// Performance
	target: 'node',

	// Source maps (disable for production)
	sourceMap: false,

	// Keep important things working
	unicodeEscapeSequence: false,
};

// Directories and files to obfuscate
const distDir = path.join(__dirname, '..', 'dist');

// Function to recursively find all .js files in dist folder
const findJsFiles = (dir, fileList = []) => {
	const files = fs.readdirSync(dir, { withFileTypes: true });

	files.forEach((file) => {
		const fullPath = path.join(dir, file.name);

		if (file.isDirectory()) {
			findJsFiles(fullPath, fileList);
		} else if (file.name.endsWith('.js') && !file.name.endsWith('.js.map')) {
			// Add relative path from distDir
			const relativePath = path.relative(distDir, fullPath);
			fileList.push(relativePath);
		}
	});

	return fileList;
};

// Get all .js files to obfuscate
const nodesToObfuscate = findJsFiles(distDir);

console.log('🔒 Starting code obfuscation...');
console.log(`📁 Found ${nodesToObfuscate.length} JavaScript files in dist folder\n`);

let successCount = 0;
let errorCount = 0;

// Obfuscate each file
nodesToObfuscate.forEach((relativePath) => {
	const filePath = path.join(distDir, relativePath);

	try {
		// Check if file exists
		if (!fs.existsSync(filePath)) {
			console.log(`⚠️  Skipping ${relativePath} (not found)`);
			return;
		}

		// Read original file
		const originalCode = fs.readFileSync(filePath, 'utf8');
		const originalSize = originalCode.length;

		// Obfuscate
		const obfuscatedResult = JavaScriptObfuscator.obfuscate(originalCode, obfuscationOptions);
		const obfuscatedCode = obfuscatedResult.getObfuscatedCode();
		const obfuscatedSize = obfuscatedCode.length;

		// Write obfuscated code back
		fs.writeFileSync(filePath, obfuscatedCode, 'utf8');

		// Calculate size increase
		const sizeIncrease = ((obfuscatedSize - originalSize) / originalSize * 100).toFixed(1);

		console.log(`✅ Obfuscated: ${relativePath}`);
		console.log(`   Original: ${(originalSize / 1024).toFixed(1)} KB`);
		console.log(`   Obfuscated: ${(obfuscatedSize / 1024).toFixed(1)} KB (${sizeIncrease > 0 ? '+' : ''}${sizeIncrease}%)`);
		console.log();

		successCount++;
	} catch (error) {
		console.error(`❌ Error obfuscating ${relativePath}:`, error.message);
		console.log();
		errorCount++;
	}
});

// Remove source maps (they reveal original code)
console.log('🗑️  Removing source maps...');
const removeSourceMaps = (dir) => {
	const files = fs.readdirSync(dir, { withFileTypes: true });

	files.forEach((file) => {
		const fullPath = path.join(dir, file.name);

		if (file.isDirectory()) {
			removeSourceMaps(fullPath);
		} else if (file.name.endsWith('.js.map')) {
			fs.unlinkSync(fullPath);
			console.log(`   Removed: ${path.relative(distDir, fullPath)}`);
		}
	});
};

try {
	removeSourceMaps(distDir);
} catch (error) {
	console.error('Error removing source maps:', error.message);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log(`📊 Obfuscation complete!`);
console.log(`   ✅ Success: ${successCount} files`);
if (errorCount > 0) {
	console.log(`   ❌ Errors: ${errorCount} files`);
}
console.log('='.repeat(60));

if (errorCount > 0) {
	process.exit(1);
}
