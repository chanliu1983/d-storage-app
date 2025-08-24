import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create target directory if it doesn't exist
const targetDir = path.join(__dirname, 'src', 'target');
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
}

// Create idl directory if it doesn't exist
const idlDir = path.join(targetDir, 'idl');
if (!fs.existsSync(idlDir)) {
    fs.mkdirSync(idlDir, { recursive: true });
}

// Create types directory if it doesn't exist
const typesDir = path.join(targetDir, 'types');
if (!fs.existsSync(typesDir)) {
    fs.mkdirSync(typesDir, { recursive: true });
}

// Copy IDL file
const idlSource = path.join(__dirname, '..', 'target', 'idl', 'flexible_token_exchange.json');
const idlDest = path.join(idlDir, 'flexible_token_exchange.json');
fs.copyFileSync(idlSource, idlDest);

// Copy types file
const typesSource = path.join(__dirname, '..', 'target', 'types', 'flexible_token_exchange.ts');
const typesDest = path.join(typesDir, 'flexible_token_exchange.ts');
fs.copyFileSync(typesSource, typesDest);

console.log('Successfully copied flexible_token_exchange IDL and types to web-app/src/target/');