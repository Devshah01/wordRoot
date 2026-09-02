const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Calculate relative path for AnimatedPressable import
  const depth = filePath.split(path.sep).length - path.resolve('./src/components').split(path.sep).length + 1;
  let importPath = '';
  if (filePath.includes('components')) {
    importPath = './AnimatedPressable';
  } else {
    // If it's in src/app, depth from src/app is 1 (../components/AnimatedPressable)
    // If it's in src/app/(tabs), depth is 2 (../../components/AnimatedPressable)
    const rel = path.relative(path.dirname(filePath), path.resolve('./src/components/AnimatedPressable'));
    importPath = rel.replace(/\\/g, '/');
  }

  let modified = false;

  // Replace TouchableOpacity import
  if (content.includes('TouchableOpacity') || content.includes('Pressable')) {
    // Check if AnimatedPressable is already imported
    if (!content.includes('AnimatedPressable')) {
      const importRegex = /import\s+.*?from\s+['"]react-native['"];?/s;
      if (importRegex.test(content)) {
        content = content.replace(importRegex, match => {
          let newMatch = match.replace(/,\s*TouchableOpacity/g, '').replace(/TouchableOpacity\s*,?/g, '');
          newMatch = newMatch.replace(/,\s*Pressable/g, '').replace(/Pressable\s*,?/g, '');
          return `${newMatch}\nimport AnimatedPressable from '${importPath}';`;
        });
        modified = true;
      }
    }
    
    // Replace JSX tags and usage
    if (content.includes('<TouchableOpacity') || content.includes('</TouchableOpacity>') || content.includes('<Pressable') || content.includes('</Pressable>')) {
      content = content.replace(/TouchableOpacity/g, 'AnimatedPressable');
      content = content.replace(/<Pressable/g, '<AnimatedPressable');
      content = content.replace(/<\/Pressable/g, '</AnimatedPressable');
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(f => {
  if (f.includes('AnimatedPressable.tsx')) return;
  try {
    replaceInFile(f);
  } catch (e) {
    console.error(`Error processing ${f}:`, e);
  }
});
