#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Get package.json to extract version
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = packageJson.version;

console.log(`📦 Building dist folder for version ${version}...`);

// Run the build command
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build completed successfully');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

// Package the dist folder into a zip file
import { createWriteStream, existsSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import archiver from 'archiver';

const distDir = path.resolve('./dist');
const zipPath = path.resolve(`./dist-${version}.zip`);

// Check if dist directory exists
if (!existsSync(distDir)) {
  console.error('❌ dist directory does not exist. Please run build first.');
  process.exit(1);
}

// Create a write stream for the zip file
const output = createWriteStream(zipPath);
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Event listener for when the archive is finished
output.on('close', () => {
  console.log(`✅ Successfully created ${zipPath}. Total bytes: ${archive.pointer()}`);
});

// Event listener for errors
archive.on('error', (err) => {
  console.error('❌ Error creating zip:', err);
  process.exit(1);
});

// Pipe the archive to the file
archive.pipe(output);

// Append the dist directory to the archive
archive.directory(distDir, false);

// Finalize the archive
archive.finalize();

output.on('close', () => {
  console.log(`✅ Successfully created ${zipPath}. Total bytes: ${archive.pointer()}`);
});
