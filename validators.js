/**
 * validators.js - Translation validation functions
 *
 * Handles checking for duplicate keys, parameter consistency,
 * pluralization consistency, and intra-file duplicates.
 */

import fs from 'fs';
import path from 'path';

// ============================================================================
// CHECK DUPLICATES
// ============================================================================

/**
 * Check for duplicate translation keys across files
 * @param {object} localeMaps - Map of locale -> translation keys
 * @returns {object} Map of locale -> array of duplicates
 */
export function checkDuplicates(localeMaps) {
  const duplicates = {};

  for (const [locale, map] of Object.entries(localeMaps)) {
    for (const [key, meta] of Object.entries(map)) {
      if (meta.count > 1) {
        if (!duplicates[locale]) duplicates[locale] = [];
        duplicates[locale].push({
          key,
          count: meta.count,
          files: meta.files
        });
      }
    }
  }

  return duplicates;
}

// ============================================================================
// CHECK PARAMETER CONSISTENCY
// ============================================================================

/**
 * Check parameter consistency across locales
 * @param {object} localeMaps - Map of locale -> translation keys
 * @param {string} baseLoc - Base locale for comparison
 * @returns {Array} Array of parameter mismatch issues
 */
export function checkParameters(localeMaps, baseLoc) {
  const issues = [];
  const baseMap = localeMaps[baseLoc] || {};

  for (const key of Object.keys(baseMap)) {
    const baseParams = baseMap[key].params || [];

    for (const [locale, map] of Object.entries(localeMaps)) {
      if (locale === baseLoc) continue;
      if (!map[key]) continue;

      const localeParams = map[key].params || [];

      const missing = baseParams.filter(p => !localeParams.includes(p));
      const extra = localeParams.filter(p => !baseParams.includes(p));

      if (missing.length || extra.length) {
        issues.push({
          key,
          locale,
          baseParams,
          localeParams,
          missing,
          extra
        });
      }
    }
  }

  return issues;
}

// ============================================================================
// CHECK PLURALIZATION CONSISTENCY
// ============================================================================

/**
 * Check pluralization consistency across locales
 * @param {object} localeMaps - Map of locale -> translation keys
 * @param {string} baseLoc - Base locale for comparison
 * @returns {Array} Array of pluralization issues
 */
export function checkPluralization(localeMaps, baseLoc) {
  const issues = [];
  const baseMap = localeMaps[baseLoc] || {};

  for (const key of Object.keys(baseMap)) {
    const basePlurals = baseMap[key].plurals;
    if (!basePlurals) continue; // Base key is not pluralized

    for (const [locale, map] of Object.entries(localeMaps)) {
      if (locale === baseLoc) continue;
      if (!map[key]) continue;

      const localePlurals = map[key].plurals;

      if (!localePlurals) {
        // Base has plurals but locale doesn't
        issues.push({
          key,
          locale,
          issue: 'missing_pluralization',
          baseRules: basePlurals.rules,
          localeRules: null
        });
      } else {
        // Check if plural rule counts match
        if (basePlurals.rules.length !== localePlurals.rules.length) {
          issues.push({
            key,
            locale,
            issue: 'plural_count_mismatch',
            baseRules: basePlurals.rules,
            localeRules: localePlurals.rules
          });
        }
      }
    }
  }

  return issues;
}

// ============================================================================
// CHECK INTRA-FILE DUPLICATES
// ============================================================================

/**
 * Extract all array keys from a PHP array file with nesting path
 * @param {string} content - File content
 * @returns {Array} Array of {key, line, indent, path} objects
 */
function extractPhpArrayKeys(content) {
  const keys = [];
  const lines = content.split('\n');
  const pathStack = []; // Track nesting path

  // Pattern to match array keys: 'key' =>, "key" =>, or key =>
  const keyPattern = /^\s*(['"`]?)([a-zA-Z0-9_.-]+)\1\s*=>/;

  lines.forEach((line, lineNum) => {
    const indent = line.match(/^\s*/)[0].length;

    // Extract key if present
    const match = line.match(keyPattern);
    if (match) {
      const key = match[2];

      // Build the full path including parent keys
      const path = pathStack.length > 0
        ? pathStack.map(p => p.key).join('.') + '.' + key
        : key;

      keys.push({
        key,
        line: lineNum + 1,
        indent,
        path,
        raw: line.trim()
      });

      // Count bracket/array depth changes on this line
      // Support both modern [...] and old array(...) syntax
      const openBrackets = (line.match(/\[/g) || []).length;
      const closeBrackets = (line.match(/\]/g) || []).length;
      const openArrays = (line.match(/array\s*\(/g) || []).length;

      // For closing parens, we need to be careful not to count function calls
      // Only count ) that are likely array closures (typically with , or ; after)
      // This is imperfect but handles most cases
      const closeArrays = (line.match(/\)\s*[,;]/g) || []).length +
                          (line.match(/\)\s*$/g) || []).length;

      // Calculate net depth change
      const netDepth = (openBrackets + openArrays) - (closeBrackets + closeArrays);

      if (netDepth > 0) {
        // This line opens more than it closes - add to stack
        pathStack.push({ key, indent });
      } else if (netDepth < 0) {
        // This line closes more than it opens - shouldn't happen for a key line
        // but handle it just in case
        for (let i = 0; i < Math.abs(netDepth); i++) {
          if (pathStack.length > 0) pathStack.pop();
        }
      }
      // netDepth === 0 means single-line array like 'key' => ['a', 'b'],
      // Don't add to stack
    } else {
      // No key on this line - check for closing brackets/parens
      const closeBrackets = (line.match(/\]/g) || []).length;
      const closeArrays = (line.match(/\)\s*[,;]/g) || []).length +
                          (line.match(/\)\s*$/g) || []).length;
      const openBrackets = (line.match(/\[/g) || []).length;
      const openArrays = (line.match(/array\s*\(/g) || []).length;

      const netCloses = (closeBrackets + closeArrays) - (openBrackets + openArrays);

      // Pop from stack for each net closure
      for (let i = 0; i < netCloses; i++) {
        if (pathStack.length > 0) {
          pathStack.pop();
        }
      }
    }
  });

  return keys;
}

/**
 * Extract all keys from a JSON file
 * @param {string} content - File content
 * @returns {Array} Array of {key, line} objects
 */
function extractJsonKeys(content) {
  const keys = [];
  const lines = content.split('\n');

  // Pattern to match JSON keys: "key":
  const keyPattern = /^\s*"([^"]+)"\s*:/;

  lines.forEach((line, lineNum) => {
    const match = line.match(keyPattern);
    if (match) {
      const key = match[1];
      keys.push({
        key,
        line: lineNum + 1,
        path: key,  // For JSON, path is the same as key (flat structure)
        raw: line.trim()
      });
    }
  });

  return keys;
}

/**
 * Find duplicate keys within the same file using full nesting path
 * @param {Array} keys - Array of key objects with path
 * @returns {Array} Array of duplicate key info
 */
function findIntraFileDuplicates(keys) {
  const duplicates = [];
  const keyMap = new Map();

  // Group keys by their full path (including parent keys)
  keys.forEach(({ key, line, path }) => {
    if (!keyMap.has(path)) {
      keyMap.set(path, []);
    }
    keyMap.get(path).push({ key, line });
  });

  // Find paths that appear more than once
  keyMap.forEach((occurrences, fullPath) => {
    if (occurrences.length > 1) {
      // Extract just the key name from the full path
      const key = fullPath.split('.').pop();
      duplicates.push({
        key,
        fullPath,
        count: occurrences.length,
        lines: occurrences.map(o => o.line).sort((a, b) => a - b)
      });
    }
  });

  return duplicates;
}

/**
 * Check for duplicate keys within each translation file
 * @param {object} config - Configuration object with LOCALES and LANG_DIR
 * @param {Function} isDir - Directory check function
 * @param {Function} isFile - File check function
 * @param {Function} verbose - Verbose logging function
 * @returns {Array} Array of intra-file duplicate issues
 */
export function checkIntraFileDuplicates(config, isDir, isFile, verbose) {
  const issues = [];

  for (const locale of config.LOCALES) {
    // Check PHP files
    const phpDir = path.join(config.LANG_DIR, locale);
    if (isDir(phpDir)) {
      for (const entry of fs.readdirSync(phpDir)) {
        if (!entry.endsWith('.php')) continue;

        const absPath = path.join(phpDir, entry);
        try {
          const content = fs.readFileSync(absPath, 'utf8');
          const keys = extractPhpArrayKeys(content);
          const duplicates = findIntraFileDuplicates(keys);

          if (duplicates.length > 0) {
            issues.push({
              locale,
              file: entry,
              path: absPath,
              duplicates
            });
          }
        } catch (e) {
          verbose(`  ⚠ Failed to check ${absPath}: ${e.message}`);
        }
      }
    }

    // Check JSON file
    const jsonPath = path.join(config.LANG_DIR, `${locale}.json`);
    if (isFile(jsonPath)) {
      try {
        const content = fs.readFileSync(jsonPath, 'utf8');
        const keys = extractJsonKeys(content);
        const duplicates = findIntraFileDuplicates(keys);

        if (duplicates.length > 0) {
          issues.push({
            locale,
            file: `${locale}.json`,
            path: jsonPath,
            duplicates
          });
        }
      } catch (e) {
        verbose(`  ⚠ Failed to check ${jsonPath}: ${e.message}`);
      }
    }
  }

  return issues;
}
