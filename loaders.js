/**
 * loaders.js - Translation file loaders and cache management
 *
 * Handles loading PHP and JSON translation files, flattening nested structures,
 * and managing MD5-based cache with mtime tracking.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import crypto from 'crypto';

// ============================================================================
// FLATTEN NESTED OBJECTS
// ============================================================================

/**
 * Flatten nested object to dot notation
 * @param {object} obj - Object to flatten
 * @param {string} prefix - Current key prefix
 * @param {object} result - Result accumulator
 * @returns {object} Flattened object
 */
export function flatten(obj, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, fullKey, result);
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

// ============================================================================
// LOAD PHP LANG FILES
// ============================================================================

/**
 * Load and parse PHP language file (secure temp file approach)
 * @param {string} absPath - Absolute path to PHP file
 * @param {Function} log - Logging function
 * @param {Function} verbose - Verbose logging function
 * @returns {object} Parsed translation data
 */
export function loadPhpLangFile(absPath, log, verbose) {
  // 1. Validate and resolve path
  const resolvedPath = path.resolve(absPath);

  // Basic security: ensure it's an absolute path and exists
  if (!path.isAbsolute(resolvedPath)) {
    log(`⚠ Warning: Invalid path: ${absPath}`, 'warn');
    return {};
  }

  // 2. Create temporary PHP script
  const tempScript = path.join(
    os.tmpdir(),
    `i18n-loader-${Date.now()}-${Math.random().toString(36).slice(2)}.php`
  );

  const phpCode = `<?php
$file = $argv[1];
if (!is_file($file)) { echo '{}'; exit; }
$arr = require $file;
if (!is_array($arr)) { echo '{}'; exit; }
echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
`;

  fs.writeFileSync(tempScript, phpCode);

  try {
    // 3. Execute with path as argument (secure)
    const res = spawnSync('php', [tempScript, resolvedPath], {
      encoding: 'utf8',
      timeout: 5000
    });

    if (res.status !== 0) {
      log(`⚠ Warning: PHP failed to parse ${absPath}`, 'warn');
      verbose(`   Error: ${res.stderr || res.stdout}`);
      return {};
    }

    return JSON.parse(res.stdout || '{}');
  } catch (e) {
    log(`⚠ Warning: Could not parse ${absPath}`, 'warn');
    verbose(`   Error: ${e.message}`);
    return {};
  } finally {
    // 4. Always cleanup temp file
    try {
      fs.unlinkSync(tempScript);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// ============================================================================
// LOAD JSON LANG FILES
// ============================================================================

/**
 * Load and parse JSON language file
 * @param {string} absPath - Absolute path to JSON file
 * @param {Function} log - Logging function
 * @param {Function} verbose - Verbose logging function
 * @returns {object} Parsed translation data
 */
export function loadJsonLangFile(absPath, log, verbose) {
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    log(`⚠ Warning: Failed to parse JSON file ${absPath}`, 'warn');
    verbose(`   Error: ${e.message}`);
    return {};
  }
}

// ============================================================================
// LOAD LOCALE (PHP + JSON)
// ============================================================================

/**
 * Load all translations for a locale
 * @param {string} locale - Locale code (e.g., 'en', 'ar')
 * @param {object} config - Configuration object with LANG_DIR
 * @param {Function} isDir - Directory check function
 * @param {Function} isFile - File check function
 * @param {Function} log - Logging function
 * @param {Function} verbose - Verbose logging function
 * @param {Function} extractParams - Parameter extraction function
 * @param {Function} extractPlurals - Pluralization extraction function
 * @returns {object} Map of translation keys to metadata
 */
export function loadLocale(locale, config, isDir, isFile, log, verbose, extractParams, extractPlurals) {
  const map = {};

  // Load single PHP file for locale (e.g., lang/en.php)
  const singlePhpPath = path.join(config.LANG_DIR, `${locale}.php`);
  if (isFile(singlePhpPath)) {
    const data = loadPhpLangFile(singlePhpPath, log, verbose);
    const flat = flatten(data);

    for (const [key, value] of Object.entries(flat)) {
      if (!map[key]) {
        map[key] = {
          value,
          count: 1,
          files: [`${locale}.php`],
          params: extractParams(value),
          plurals: extractPlurals(value)
        };
      } else {
        map[key].count++;
        map[key].files.push(`${locale}.php`);
      }
    }
  }

  // Load PHP files from locale directory (e.g., lang/en/auth.php)
  const phpDir = path.join(config.LANG_DIR, locale);
  if (isDir(phpDir)) {
    for (const entry of fs.readdirSync(phpDir)) {
      if (!entry.endsWith('.php')) continue;

      const namespace = entry.replace(/\.php$/, '');
      const absPath = path.join(phpDir, entry);
      const data = loadPhpLangFile(absPath, log, verbose);
      const flat = flatten(data, namespace);

      for (const [key, value] of Object.entries(flat)) {
        if (!map[key]) {
          map[key] = {
            value,
            count: 1,
            files: [entry],
            params: extractParams(value),
            plurals: extractPlurals(value)
          };
        } else {
          map[key].count++;
          map[key].files.push(entry);
        }
      }
    }
  }

  // Load JSON file (Laravel JSON translations)
  const jsonPath = path.join(config.LANG_DIR, `${locale}.json`);
  if (isFile(jsonPath)) {
    const data = loadJsonLangFile(jsonPath, log, verbose);
    for (const [key, value] of Object.entries(data)) {
      if (!map[key]) {
        map[key] = {
          value,
          count: 1,
          files: [`${locale}.json`],
          params: extractParams(value),
          plurals: extractPlurals(value)
        };
      } else {
        map[key].count++;
        map[key].files.push(`${locale}.json`);
      }
    }
  }

  return map;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Get latest modification time of all translation files
 * @param {object} config - Configuration object with LOCALES and LANG_DIR
 * @param {Function} isDir - Directory check function
 * @param {Function} isFile - File check function
 * @returns {number} Latest mtime in milliseconds
 */
function getTranslationFilesMtime(config, isDir, isFile) {
  let latestMtime = 0;

  for (const locale of config.LOCALES) {
    // Check single PHP file (e.g., lang/en.php)
    const singlePhpPath = path.join(config.LANG_DIR, `${locale}.php`);
    if (isFile(singlePhpPath)) {
      try {
        const stat = fs.statSync(singlePhpPath);
        latestMtime = Math.max(latestMtime, stat.mtimeMs);
      } catch (e) {
        // Ignore errors
      }
    }

    // Check PHP directory files (e.g., lang/en/auth.php)
    const phpDir = path.join(config.LANG_DIR, locale);
    if (isDir(phpDir)) {
      for (const entry of fs.readdirSync(phpDir)) {
        if (!entry.endsWith('.php')) continue;
        const absPath = path.join(phpDir, entry);
        try {
          const stat = fs.statSync(absPath);
          latestMtime = Math.max(latestMtime, stat.mtimeMs);
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Check JSON file
    const jsonPath = path.join(config.LANG_DIR, `${locale}.json`);
    if (isFile(jsonPath)) {
      try {
        const stat = fs.statSync(jsonPath);
        latestMtime = Math.max(latestMtime, stat.mtimeMs);
      } catch (e) {
        // Ignore errors
      }
    }
  }

  return latestMtime;
}

/**
 * Generate cache key based on config and file modification times
 * @param {object} config - Configuration object
 * @param {Function} isDir - Directory check function
 * @param {Function} isFile - File check function
 * @returns {string} MD5 hash for cache key
 */
function getCacheKey(config, isDir, isFile) {
  const hash = crypto.createHash('md5');
  hash.update(JSON.stringify(config.LOCALES));
  hash.update(config.LANG_DIR);
  hash.update(getTranslationFilesMtime(config, isDir, isFile).toString());
  return hash.digest('hex');
}

/**
 * Load cached translation data
 * @param {object} config - Configuration object
 * @param {Function} isFile - File check function
 * @param {Function} isDir - Directory check function
 * @param {Function} verbose - Verbose logging function
 * @returns {object|null} Cached data or null
 */
export function loadCache(config, isFile, isDir, verbose) {
  if (!config.USE_CACHE) return null;

  try {
    if (!isFile(config.CACHE_FILE)) return null;

    const cache = JSON.parse(fs.readFileSync(config.CACHE_FILE, 'utf8'));
    const cacheKey = getCacheKey(config, isDir, isFile);

    if (cache.key === cacheKey && cache.timestamp) {
      const age = Date.now() - cache.timestamp;
      if (age < 3600000) { // 1 hour
        verbose('✓ Using cached translation data');
        return cache.data;
      } else {
        verbose('⚠ Cache expired, will regenerate');
      }
    } else {
      verbose('⚠ Cache key mismatch, will regenerate');
    }
  } catch (e) {
    verbose('⚠ Cache read failed, will regenerate');
  }

  return null;
}

/**
 * Save translation data to cache
 * @param {object} data - Translation data to cache
 * @param {object} config - Configuration object
 * @param {Function} isDir - Directory check function
 * @param {Function} isFile - File check function
 * @param {Function} verbose - Verbose logging function
 */
export function saveCache(data, config, isDir, isFile, verbose) {
  if (!config.USE_CACHE) return;

  try {
    const cache = {
      key: getCacheKey(config, isDir, isFile),
      timestamp: Date.now(),
      data
    };
    fs.writeFileSync(config.CACHE_FILE, JSON.stringify(cache, null, 2));
    verbose('✓ Cache saved');
  } catch (e) {
    verbose('⚠ Cache save failed');
  }
}

/**
 * Clear cache file
 * @param {object} config - Configuration object
 * @param {Function} isFile - File check function
 * @param {Function} log - Logging function
 */
export function clearCache(config, isFile, log) {
  try {
    if (isFile(config.CACHE_FILE)) {
      fs.unlinkSync(config.CACHE_FILE);
      log('✓ Cache cleared', 'success');
    }
  } catch (e) {
    log('⚠ Failed to clear cache', 'warn');
  }
}
