/**
 * scanner.js - File scanning and translation key extraction
 *
 * Handles walking directory trees, extracting translation keys from source files,
 * and detecting parameters and pluralization patterns.
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// GITIGNORE PARSER
// ============================================================================

/**
 * Parse .gitignore file and return pattern matcher
 * @param {string} gitignorePath - Path to .gitignore file
 * @param {string} baseDir - Base directory for relative paths
 * @param {Function} verbose - Verbose logging function
 * @returns {Function|null} Function that tests if a file should be ignored, or null if no .gitignore
 */
export function parseGitignore(gitignorePath, baseDir, verbose) {
  if (!fs.existsSync(gitignorePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    const lines = content.split('\n');
    const patterns = [];

    for (let line of lines) {
      // Remove comments and trim
      const commentIndex = line.indexOf('#');
      if (commentIndex === 0) continue; // Skip comment lines
      if (commentIndex > 0) line = line.substring(0, commentIndex);
      line = line.trim();

      if (!line) continue; // Skip blank lines

      // Handle negation
      const negated = line.startsWith('!');
      if (negated) line = line.substring(1);

      // Handle directory-only patterns (trailing /)
      const dirOnly = line.endsWith('/');
      if (dirOnly) line = line.substring(0, line.length - 1);

      // Handle patterns rooted at gitignore location (leading /)
      const rooted = line.startsWith('/');
      if (rooted) line = line.substring(1);

      patterns.push({ pattern: line, negated, dirOnly, rooted });
    }

    verbose(`✓ Loaded .gitignore with ${patterns.length} patterns`);

    /**
     * Test if a file path should be ignored
     * @param {string} filePath - Absolute file path
     * @param {boolean} isDirectory - Whether the path is a directory
     * @returns {boolean} True if the file should be ignored
     */
    return function isGitignored(filePath, isDirectory = false) {
      // Get relative path from base directory
      const relativePath = path.relative(baseDir, filePath);
      if (!relativePath || relativePath.startsWith('..')) return false;

      let ignored = false;

      for (const { pattern, negated, dirOnly, rooted } of patterns) {
        // Skip directory-only patterns for files
        if (dirOnly && !isDirectory) continue;

        // Convert gitignore pattern to regex-like test
        let matched = false;

        if (rooted) {
          // Pattern is rooted at base directory
          matched = matchPattern(relativePath, pattern);
        } else {
          // Pattern can match anywhere in the path
          // Check if pattern matches the path itself or any component
          const pathParts = relativePath.split(path.sep);

          // Test full path
          if (matchPattern(relativePath, pattern)) {
            matched = true;
          } else {
            // Test each path component (for patterns like "node_modules")
            for (let i = 0; i < pathParts.length; i++) {
              const subPath = pathParts.slice(i).join(path.sep);
              if (matchPattern(subPath, pattern)) {
                matched = true;
                break;
              }
            }
          }
        }

        if (matched) {
          ignored = !negated; // Negation flips the ignore status
        }
      }

      return ignored;
    };
  } catch (e) {
    verbose(`⚠ Warning: Failed to parse .gitignore: ${e.message}`);
    return null;
  }
}

/**
 * Match a path against a gitignore pattern
 * @param {string} testPath - Path to test
 * @param {string} pattern - Gitignore pattern
 * @returns {boolean} True if pattern matches
 */
function matchPattern(testPath, pattern) {
  // Handle special patterns
  if (pattern === testPath) return true;

  // Convert gitignore glob to regex
  let regexPattern = pattern
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>') // Temporarily replace **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/<<<DOUBLESTAR>>>/g, '.*') // ** matches anything including /
    .replace(/\?/g, '[^/]'); // ? matches single character except /

  // Create regex that matches from start or as full path component
  const regex = new RegExp(`^${regexPattern}(/|$)`);
  const exactRegex = new RegExp(`^${regexPattern}$`);

  return regex.test(testPath) || exactRegex.test(testPath);
}

// ============================================================================
// EXTRACT PARAMETERS FROM TRANSLATION STRING
// ============================================================================

/**
 * Extract parameter placeholders from translation string
 * @param {string} text - Translation string
 * @returns {string[]} Sorted array of parameter names
 */
export function extractParams(text) {
  if (typeof text !== 'string') return [];

  const params = new Set();

  // Laravel style: :param
  const colonPattern = /:(\w+)/g;
  let match;
  while ((match = colonPattern.exec(text))) {
    params.add(match[1]);
  }

  // Bracket style: {param} - BUT exclude {digit} used in pluralization
  const bracketPattern = /\{(\w+)\}/g;
  while ((match = bracketPattern.exec(text))) {
    // Skip if it's a number (pluralization like {0}, {1})
    if (!/^\d+$/.test(match[1])) {
      params.add(match[1]);
    }
  }

  return Array.from(params).sort();
}

// ============================================================================
// EXTRACT PLURALIZATION PATTERNS
// ============================================================================

/**
 * Extract pluralization rules from translation string
 * @param {string} text - Translation string
 * @returns {object|null} Pluralization metadata or null
 */
export function extractPlurals(text) {
  if (typeof text !== 'string') return null;

  // Laravel pluralization pattern: {0} none|{1} one|[2,*] many
  // or: {0} none|[1,1] one|[2,*] many
  const pluralPattern = /\{(\d+)\}|\[(\d+),(\d+|\*)\]/g;
  const matches = Array.from(text.matchAll(pluralPattern));

  if (matches.length === 0) return null;

  const rules = [];
  for (const match of matches) {
    if (match[1] !== undefined) {
      // Exact count: {0}, {1}
      rules.push({ type: 'exact', value: parseInt(match[1], 10) });
    } else if (match[2] !== undefined) {
      // Range: [2,*], [1,5]
      const from = parseInt(match[2], 10);
      const to = match[3] === '*' ? Infinity : parseInt(match[3], 10);
      rules.push({ type: 'range', from, to });
    }
  }

  return rules.length > 0 ? { rules, raw: text } : null;
}

// ============================================================================
// FILE WALKER
// ============================================================================

/**
 * Walk directory tree, yielding file paths
 * @param {string} dir - Directory to walk
 * @param {object} config - Configuration object with EXT_LIST
 * @param {Set} ignoredDirs - Set of directory names to ignore
 * @param {Function} isDir - Directory check function
 * @param {Function} verbose - Verbose logging function
 * @param {Function|null} gitignoreMatcher - Optional gitignore matcher function
 * @param {Set} visited - Set of visited real paths (for circular symlink protection)
 * @yields {string} File paths matching configured extensions
 */
export function* walk(dir, config, ignoredDirs, isDir, verbose, gitignoreMatcher = null, visited = new Set()) {
  if (!isDir(dir)) return;

  try {
    // Resolve real path to detect circular symlinks
    const realPath = fs.realpathSync(dir);
    if (visited.has(realPath)) {
      verbose(`⚠ Skipping circular symlink: ${dir}`);
      return; // Circular symlink detected
    }
    visited.add(realPath);

    const list = fs.readdirSync(dir, { withFileTypes: true });

    for (const ent of list) {
      if (ent.name.startsWith('.')) continue;

      const fullPath = path.join(dir, ent.name);

      // Check if path is gitignored
      if (gitignoreMatcher && gitignoreMatcher(fullPath, ent.isDirectory())) {
        verbose(`  ⊗ Gitignored: ${fullPath}`);
        continue;
      }

      if (ent.isDirectory()) {
        if (ignoredDirs.has(ent.name)) continue;
        yield* walk(fullPath, config, ignoredDirs, isDir, verbose, gitignoreMatcher, visited);
      } else {
        const lower = ent.name.toLowerCase();

        // Check if file matches any extension
        const matches = config.EXT_LIST.some(ext => {
          if (ext === 'blade.php') {
            return lower.endsWith('.blade.php');
          }
          return lower.endsWith('.' + ext.toLowerCase());
        });

        if (matches) yield fullPath;
      }
    }
  } catch (e) {
    verbose(`⚠ Error walking directory ${dir}: ${e.message}`);
  }
}

// ============================================================================
// COMMENT STRIPPING
// ============================================================================

/**
 * Strip comments from code to prevent false positive key extraction
 * @param {string} content - File content
 * @param {string} filePath - File path for type detection
 * @returns {string} Content with comments replaced by whitespace
 */
function stripComments(content, filePath = '') {
  const ext = filePath.toLowerCase();

  // Determine file type
  const isPhp = ext.endsWith('.php');
  const isJs = ext.endsWith('.js') || ext.endsWith('.jsx') ||
               ext.endsWith('.ts') || ext.endsWith('.tsx') ||
               ext.endsWith('.vue');

  if (!isPhp && !isJs) return content; // Unknown type, don't strip

  let result = content;

  // Strip multi-line comments /* ... */ and /** ... */
  // Replace with equal-length whitespace to preserve line numbers
  result = result.replace(/\/\*[\s\S]*?\*\//g, (match) => {
    return match.replace(/[^\n]/g, ' ');
  });

  // Strip single-line comments // ...
  // PHP also supports # comments
  if (isPhp) {
    // PHP: // comments and # comments (but not inside strings)
    result = result.replace(/\/\/.*$/gm, (match) => ' '.repeat(match.length));
    result = result.replace(/#.*$/gm, (match) => ' '.repeat(match.length));
  } else {
    // JS/TS: only // comments
    result = result.replace(/\/\/.*$/gm, (match) => ' '.repeat(match.length));
  }

  return result;
}

// ============================================================================
// EXTRACT TRANSLATION KEYS (ENHANCED)
// ============================================================================

/**
 * Extract translation keys from file content
 * @param {string} content - File content
 * @param {string} filePath - Relative file path
 * @returns {object} Extraction results with keys, dynamic keys, and locations
 */
export function extractKeys(content, filePath = '') {
  // Strip comments to prevent false positives
  const cleanedContent = stripComments(content, filePath);
  const results = {
    keys: new Set(),
    dynamicKeys: [],
    locations: {}
  };

  // Use original lines for snippets, cleaned lines for pattern matching
  const lines = content.split('\n');
  const cleanedLines = cleanedContent.split('\n');

  // Define patterns (will be pre-compiled below)
  // NOTE: Patterns now allow $ in keys, validation filters out PHP variables later
  const compiledPatterns = [
    // PHP: __('key') or __("key")
    { regex: /__\(\s*['"`]([^'"`]+?)['"`]\s*[,)]/g, group: 1 },

    // Blade: @lang('key')
    { regex: /@lang\(\s*['"`]([^'"`]+?)['"`]\s*[,)]/g, group: 1 },

    // Blade: @choice('key', n)
    { regex: /@choice\(\s*['"`]([^'"`]+?)['"`]\s*,/g, group: 1 },

    // trans_choice
    { regex: /trans_choice\(\s*['"`]([^'"`]+?)['"`]\s*[,)]/g, group: 1 },

    // Laravel: trans('key') - legacy helper
    { regex: /\btrans\(\s*['"`]([^'"`]+?)['"`]\s*[,)]/g, group: 1 },

    // Laravel: Lang::get('key') - facade call
    { regex: /Lang::get\(\s*['"`]([^'"`]+?)['"`]\s*[,)]/g, group: 1 },

    // JS/TS: t('key')
    { regex: /\bt\(\s*['"`]([^'"`]+?)['"`]\s*[,)]/g, group: 1 },

    // Inertia: usePage().props.__('key') or page.props.__('key')
    { regex: /(?:usePage\(\)\.props|page\.props)\.__\(\s*['"`]([^'"`]+?)['"`]/g, group: 1 },

    // React/Vue JSX: {__('key')} or {t('key')}
    { regex: /\{(?:__|t)\(\s*['"`]([^'"`]+?)['"`]\s*[,)]\}/g, group: 1 },
  ];

  // ✅ PRE-COMPILE PATTERNS ONCE (3x performance improvement)
  const precompiled = compiledPatterns.map(({ regex, group }) => ({
    regex: new RegExp(regex.source, regex.flags),
    group
  }));

  const MAX_LOCATIONS_PER_KEY = 100;
  const WINDOW_SIZE = 3; // Detect patterns spanning up to 3 lines

  // Track processed matches to avoid duplicates from sliding window overlap
  const processedMatches = new Set();

  // ✅ SLIDING WINDOW for multiline pattern support
  for (let i = 0; i < lines.length; i++) {
    // Create window buffer of up to WINDOW_SIZE lines
    // Use cleaned lines for pattern matching to avoid detecting keys in comments
    const windowLines = [];
    for (let j = 0; j < WINDOW_SIZE && i + j < cleanedLines.length; j++) {
      windowLines.push(cleanedLines[i + j]);
    }
    const buf = windowLines.join('\n');

    // Extract static keys using pre-compiled patterns
    precompiled.forEach(({ regex, group }) => {
      regex.lastIndex = 0; // Reset position for next window
      let match;

      while ((match = regex.exec(buf))) {
        const key = match[group].trim();

        // Calculate actual line number within window
        const beforeMatch = buf.substring(0, match.index);
        const newlineCount = (beforeMatch.match(/\n/g) || []).length;
        const actualLineNum = i + newlineCount + 1; // +1 for 1-indexed

        // Avoid duplicate detections from overlapping windows
        const matchId = `${key}:${actualLineNum}`;
        if (processedMatches.has(matchId)) continue;
        processedMatches.add(matchId);

        // Validate key format
        // Allow dot notation (e.g., "auth.failed") OR JSON sentence keys (e.g., "Welcome back")
        const isDotNotation = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i.test(key);
        const isJsonSentence = key.length > 0 &&
                               !/\$[a-zA-Z_]/.test(key) &&  // ✅ FIX #3: Rejects "$var" but allows "$99"
                               !key.includes('`') &&        // No template literals
                               !key.startsWith('{') &&      // No object syntax
                               key.trim() === key;          // No leading/trailing whitespace

        if (isDotNotation || isJsonSentence) {
          results.keys.add(key);

          if (!results.locations[key]) {
            results.locations[key] = [];
          }

          // ✅ FIX #5: Memory limit - only store up to MAX locations per key
          if (results.locations[key].length < MAX_LOCATIONS_PER_KEY) {
            // Get snippet from the actual line where pattern starts
            const snippetLine = lines[i + newlineCount] || '';
            results.locations[key].push({
              file: filePath,
              line: actualLineNum,
              snippet: snippetLine.trim()
            });
          }
        }
      }
    });

    // Detect dynamic keys in the window
    const dynamicPatterns = [
      /__\(\s*['"`][^'"`]*\$\{/,  // __(`key.${var}`)
      /__\(\s*['"`][^'"`]*\$/,     // __("key.$var")
      /\bt\(\s*['"`][^'"`]*\$\{/,  // t(`key.${var}`)
    ];

    dynamicPatterns.forEach(pattern => {
      if (pattern.test(buf)) {
        // Find which line in the window contains the dynamic pattern
        for (let j = 0; j < windowLines.length; j++) {
          if (pattern.test(windowLines[j])) {
            const lineNum = i + j + 1;
            const matchId = `dynamic:${filePath}:${lineNum}`;
            if (processedMatches.has(matchId)) continue;
            processedMatches.add(matchId);

            results.dynamicKeys.push({
              file: filePath,
              line: lineNum,
              snippet: windowLines[j].trim()
            });
            break; // Only record once per window
          }
        }
      }
    });
  }

  return results;
}
