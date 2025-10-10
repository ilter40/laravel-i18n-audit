#!/usr/bin/env node
/**
 * laravel-i18n-audit — Enhanced Laravel + Inertia i18n verifier v3.2.5
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

// Import modules
import { loadLocale, loadCache, saveCache, clearCache } from './loaders.js';
import { walk, extractKeys, extractParams, extractPlurals, parseGitignore } from './scanner.js';
import { checkDuplicates, checkParameters, checkPluralization, checkIntraFileDuplicates } from './validators.js';

const args = process.argv.slice(2);

// ============================================================================
// VERSION AND HELP
// ============================================================================

const VERSION = '3.3.0';

function showHelp() {
  console.log(`
laravel-i18n-audit v${VERSION}

Enterprise-grade i18n translation auditor for Laravel + Inertia.js applications.

USAGE:
  laravel-i18n-audit [options]
  npx laravel-i18n-audit [options]

OPTIONS:
  --src <path>              Source directory to scan (default: ./)
  --lang <path>             Lang directory (default: resources/lang)
  --locales <list>          Comma-separated locales (default: en,ar)
  --ext <list>              File extensions to scan (comma-separated)

  --show-orphans            Show unused translation keys
  --fail-on-orphans         Exit with error on orphan keys
  --show-duplicates         Show duplicate keys across files
  --no-duplicates           Hide duplicate keys check

  --check-params            Verify parameter consistency across locales
  --check-plurals           Verify pluralization rules
  --check-file-duplicates   Check for duplicate keys within same file
  --respect-gitignore       Respect .gitignore patterns when scanning (default: false)

  --cache                   Use cache for faster checks
  --clear-cache             Clear cache before running

  --json                    Output results as JSON
  --verbose                 Show detailed output
  --config <path>           Load config from file (default: .i18nrc.json)

  --help, -h                Show this help message
  --version, -v             Show version number

EXIT CODES:
  0   Success (no issues found)
  1   Missing translations
  2   Parity issues between locales
  4   Duplicate keys (across files)
  8   Parameter mismatches
  16  Orphan keys (when --fail-on-orphans is set)
  32  Pluralization issues
  64  Duplicate keys within same file

  Note: Exit codes are combined using bitwise OR when multiple issues exist.

CONFIGURATION FILE (.i18nrc.json):
  {
    "locales": ["en", "ar"],
    "showOrphans": true,
    "ignoreDomains": ["passwords", "auth", "pagination"],
    "ignoreKeys": ["specific.key.to.ignore"],
    "ignorePatterns": ["^validation\\.custom\\."],
    "checkParams": true,
    "cache": true
  }

  Ignore options (v3.3.0+):
    ignoreDomains   Ignore entire namespaces (e.g., "passwords" ignores "passwords.*")
    ignoreKeys      Array of exact translation keys to ignore in orphan detection
    ignorePatterns  Array of regex patterns to match keys to ignore

EXAMPLES:
  # Basic check
  laravel-i18n-audit

  # Full audit with all checks
  laravel-i18n-audit --check-params --check-plurals --check-file-duplicates

  # Show orphans (with framework keys ignored via config)
  laravel-i18n-audit --show-orphans --config .i18nrc.json

  # Fast check with caching
  laravel-i18n-audit --cache

  # CI/CD integration
  laravel-i18n-audit --json --check-params --check-plurals

  # Custom configuration
  laravel-i18n-audit --config ./.i18nrc.custom.json

DOCUMENTATION:
  https://github.com/Saleh7/laravel-i18n-audit#readme

REPORT BUGS:
  https://github.com/Saleh7/laravel-i18n-audit/issues
`);
  process.exit(0);
}

// Check for help and version flags
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(VERSION);
  process.exit(0);
}

// ============================================================================
// EXIT CODE CONSTANTS
// ============================================================================

const EXIT_CODES = {
  SUCCESS: 0,
  MISSING_TRANSLATIONS: 1,
  PARITY_ISSUES: 2,
  DUPLICATE_KEYS: 4,
  PARAMETER_MISMATCHES: 8,
  ORPHAN_KEYS: 16,
  PLURALIZATION_ISSUES: 32,
  INTRA_FILE_DUPLICATES: 64,
};

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

/**
 * Get CLI argument value by name
 * @param {string} name - Argument name (e.g., '--src')
 * @param {*} def - Default value
 * @returns {*} Argument value
 */
function getArg(name, def) {
  const i = args.findIndex(a => a === name || a.startsWith(name + '='));
  if (i === -1) return def;
  const a = args[i];
  if (a.includes('=')) return a.split('=').slice(1).join('=');
  const next = args[i + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

/**
 * Validate configuration object
 * @param {object} config - Configuration object to validate
 * @param {string} configPath - Path to config file (for error messages)
 * @returns {object} Validated config with warnings for invalid fields
 */
function validateConfig(config, configPath) {
  const warnings = [];
  const validConfig = {};

  // Define valid config keys and their types
  const schema = {
    $schema: 'string',        // JSON Schema reference (ignored but allowed)
    src: 'string',
    lang: 'string',
    locales: 'array',
    extensions: 'array',
    showOrphans: 'boolean',
    failOnOrphans: 'boolean',
    showDuplicates: 'boolean',
    checkParams: 'boolean',
    checkPlurals: 'boolean',
    checkFileDuplicates: 'boolean',
    respectGitignore: 'boolean',
    cache: 'boolean',
    verbose: 'boolean',
    json: 'boolean',
    ignoreKeys: 'array',      // Exact keys to ignore in orphan detection
    ignorePatterns: 'array',  // Regex patterns for keys to ignore
    ignoreDomains: 'array'    // Domain prefixes to ignore (e.g., "passwords" ignores "passwords.*")
  };

  // Validate each field
  for (const [key, expectedType] of Object.entries(schema)) {
    if (config[key] !== undefined) {
      const actualType = Array.isArray(config[key]) ? 'array' : typeof config[key];

      if (actualType !== expectedType) {
        warnings.push(`  • "${key}": Expected ${expectedType}, got ${actualType}`);
      } else if (expectedType === 'array' && config[key].length === 0) {
        warnings.push(`  • "${key}": Array is empty`);
      } else {
        validConfig[key] = config[key];
      }
    }
  }

  // Warn about unknown keys
  for (const key of Object.keys(config)) {
    if (!(key in schema)) {
      warnings.push(`  • "${key}": Unknown configuration key (will be ignored)`);
    }
  }

  // Display warnings if any
  if (warnings.length > 0) {
    console.warn(`⚠️  Configuration validation warnings in ${configPath}:`);
    warnings.forEach(w => console.warn(w));
    console.warn('');
  }

  return validConfig;
}

/**
 * Load configuration from file
 * @param {string} configPath - Path to config file
 * @returns {object|null} Configuration object or null
 */
function loadConfig(configPath) {
  try {
    // Check if file exists inline (can't use isFile() as it's not initialized yet)
    if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
      // Note: Can't use verbose() here as CONFIG isn't initialized yet
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(content);

      // Validate the parsed config
      return validateConfig(parsed, configPath);
    }
  } catch (e) {
    // Only warn if the file exists but failed to parse (not if it doesn't exist)
    if (fs.existsSync(configPath)) {
      console.error(`❌ Error: Failed to parse config file ${configPath}`);
      console.error(`   ${e.message}`);

      // Provide helpful suggestions for common JSON errors
      if (e.message.includes('Unexpected token')) {
        console.error('   Hint: Check for trailing commas or missing quotes');
      } else if (e.message.includes('Unexpected end')) {
        console.error('   Hint: Check for missing closing brackets or braces');
      }
      console.error('');
      process.exit(1); // Exit on invalid JSON
    }
  }
  return null;
}

// Load config file (if exists)
const configPath = getArg('--config', path.join(process.cwd(), '.i18nrc.json'));
const configFile = loadConfig(configPath) || {};

// Helper to safely parse list flags (prevents TypeError when flag has no value)
const parseListArg = (argName, defaultValue) => {
  const value = getArg(argName, null);
  if (value && typeof value === 'string' && value.length > 0) {
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
  return defaultValue;
};

// ============================================================================
// DEFAULT CONFIGURATION VALUES
// ============================================================================

const DEFAULT_SHOW_DUPLICATES = true; // By default, show duplicate key warnings

const CONFIG = {
  SRC: getArg('--src', configFile.src || process.cwd()),
  LANG_DIR: getArg('--lang', configFile.lang || path.join(process.cwd(), 'resources', 'lang')),
  LOCALES: parseListArg('--locales', configFile.locales || ['en', 'ar']),
  SHOW_ORPHANS: getArg('--show-orphans', configFile.showOrphans || false),
  FAIL_ON_ORPHANS: getArg('--fail-on-orphans', configFile.failOnOrphans || false),
  // Normalize to boolean: --no-duplicates forces false, --show-duplicates forces true, otherwise use config or default
  SHOW_DUPLICATES: getArg('--no-duplicates', false)
    ? false
    : getArg('--show-duplicates', false)
      ? true
      : (configFile.showDuplicates !== undefined ? configFile.showDuplicates : DEFAULT_SHOW_DUPLICATES),
  EXT_LIST: parseListArg('--ext', configFile.extensions || ['php', 'blade.php', 'ts', 'tsx', 'js', 'jsx', 'vue']),
  USE_CACHE: getArg('--cache', configFile.cache || false),
  CLEAR_CACHE: getArg('--clear-cache', false),
  CHECK_PARAMS: getArg('--check-params', configFile.checkParams || false),
  CHECK_PLURALS: getArg('--check-plurals', configFile.checkPlurals || false),
  CHECK_FILE_DUPLICATES: getArg('--check-file-duplicates', configFile.checkFileDuplicates || false),
  RESPECT_GITIGNORE: getArg('--respect-gitignore', configFile.respectGitignore || false),
  JSON_OUTPUT: getArg('--json', configFile.json || false),
  VERBOSE: getArg('--verbose', configFile.verbose || false),
  CACHE_FILE: path.join(process.cwd(), '.i18n-cache.json'),
  IGNORE_KEYS: configFile.ignoreKeys || [],
  IGNORE_PATTERNS: configFile.ignorePatterns || [],
  IGNORE_DOMAINS: configFile.ignoreDomains || []
};

// ============================================================================
// INPUT VALIDATION
// ============================================================================

// Validate locales
if (!CONFIG.LOCALES || CONFIG.LOCALES.length === 0) {
  console.error('❌ Error: At least one locale must be specified');
  console.error('   Use --locales flag or add locales to .i18nrc.json');
  process.exit(1);
}

// Validate source directory
try {
  if (!fs.existsSync(CONFIG.SRC) || !fs.statSync(CONFIG.SRC).isDirectory()) {
    console.error(`❌ Error: Source directory does not exist: ${CONFIG.SRC}`);
    process.exit(1);
  }
} catch (e) {
  console.error(`❌ Error: Cannot access source directory: ${CONFIG.SRC}`);
  console.error(`   ${e.message}`);
  process.exit(1);
}

// Validate language directory (warning only - might not exist in new projects)
try {
  if (!fs.existsSync(CONFIG.LANG_DIR)) {
    console.warn(`⚠️  Warning: Lang directory does not exist: ${CONFIG.LANG_DIR}`);
    console.warn('   Translation files will not be loaded');
  } else if (!fs.statSync(CONFIG.LANG_DIR).isDirectory()) {
    console.error(`❌ Error: Lang path is not a directory: ${CONFIG.LANG_DIR}`);
    process.exit(1);
  }
} catch (e) {
  console.warn(`⚠️  Warning: Cannot access lang directory: ${CONFIG.LANG_DIR}`);
}

// ============================================================================
// UTILITIES
// ============================================================================

const IGNORED_DIRS = new Set([
  '.claude', 'node_modules', 'vendor', '.git', '.idea', '.vscode',
  'config', 'storage', 'database', 'routes', 'bootstrap',
  'public', 'build', 'dist', '.next', 'out',  // Build output directories
  'tests', 'testdata', 'docs', 'doc', 'scripts', 'bin'
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - skip files larger than this

const ansi = {
  red: s => `\x1b[31m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  magenta: s => `\x1b[35m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
};

/**
 * Check if path is a directory
 * @param {string} p - Path to check
 * @returns {boolean}
 */
const isDir = p => {
  try { return fs.statSync(p).isDirectory(); }
  catch { return false; }
};

/**
 * Check if path is a file
 * @param {string} p - Path to check
 * @returns {boolean}
 */
const isFile = p => {
  try { return fs.statSync(p).isFile(); }
  catch { return false; }
};

/**
 * Log message with color
 * @param {string} msg - Message to log
 * @param {string} level - Log level (info, warn, error, success)
 */
function log(msg, level = 'info') {
  // Check if CONFIG exists and JSON_OUTPUT is enabled
  if (typeof CONFIG !== 'undefined' && CONFIG.JSON_OUTPUT) return;
  const colors = { info: 'cyan', warn: 'yellow', error: 'red', success: 'green' };
  console.log(ansi[colors[level] || 'cyan'](msg));
}

/**
 * Log verbose message
 * @param {string} msg - Message to log
 */
function verbose(msg) {
  // Check if CONFIG exists before accessing it
  if (typeof CONFIG !== 'undefined' && CONFIG.VERBOSE && !CONFIG.JSON_OUTPUT) {
    console.log(ansi.dim(msg));
  }
}

// ============================================================================
// PHP VALIDATION
// ============================================================================

/**
 * Validate PHP installation
 * @returns {boolean} True if PHP is available
 */
function validatePhp() {
  const res = spawnSync('php', ['-v'], { encoding: 'utf8' });
  if (res.status !== 0) {
    log('❌ Error: PHP is not installed or not in PATH', 'error');
    log('   Please install PHP to scan PHP lang files', 'error');
    process.exit(1);
  }
  verbose(`✓ PHP detected: ${res.stdout.split('\n')[0]}`);
  return true;
}

// ============================================================================
// SIGNAL HANDLERS
// ============================================================================

let isShuttingDown = false;

/**
 * Handle shutdown signals gracefully
 * @param {string} signal - Signal name (SIGINT, SIGTERM)
 */
function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  // Show message to user (unless JSON output mode)
  if (!CONFIG.JSON_OUTPUT) {
    console.log(`\n⚠️  Received ${signal}, exiting...`);
  }
  process.exit(130); // Standard exit code for SIGINT
}

// Register signal handlers
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// ============================================================================
// MAIN EXECUTION
// ============================================================================

(function main() {
  const t0 = Date.now();

  if (!CONFIG.JSON_OUTPUT) {
    console.log(ansi.bold(ansi.cyan('\n╔════════════════════════════════════════╗')));
    console.log(ansi.bold(ansi.cyan('║  i18n Translation Checker v3.3.0 🌍    ║')));
    console.log(ansi.bold(ansi.cyan('╚════════════════════════════════════════╝\n')));
  }

  // Validate PHP only if PHP translation files actually exist
  function needsPhp() {
    for (const locale of CONFIG.LOCALES) {
      // Check single PHP file (e.g., lang/en.php)
      const singlePhp = path.join(CONFIG.LANG_DIR, `${locale}.php`);
      if (isFile(singlePhp)) return true;

      // Check PHP directory for .php files
      const phpDir = path.join(CONFIG.LANG_DIR, locale);
      if (isDir(phpDir)) {
        try {
          const entries = fs.readdirSync(phpDir);
          if (entries.some(f => f.endsWith('.php'))) {
            return true;
          }
        } catch (e) {
          // Ignore read errors
        }
      }
    }
    return false;
  }

  if (needsPhp()) {
    validatePhp();
  } else {
    verbose('✓ Skipping PHP validation (JSON-only project)');
  }

  // Clear cache if requested
  if (CONFIG.CLEAR_CACHE) {
    clearCache(CONFIG, isFile, log);
  }

  // Try loading from cache
  let localeMaps = loadCache(CONFIG, isFile, isDir, verbose);

  // Load locales (or use cache)
  if (!localeMaps) {
    log('📚 Loading translation files...', 'info');
    localeMaps = {};

    for (const locale of CONFIG.LOCALES) {
      verbose(`  Loading ${locale}...`);
      localeMaps[locale] = loadLocale(locale, CONFIG, isDir, isFile, log, verbose, extractParams, extractPlurals);
    }

    saveCache(localeMaps, CONFIG, isDir, isFile, verbose);
  }

  // Parse .gitignore if enabled
  let gitignoreMatcher = null;
  if (CONFIG.RESPECT_GITIGNORE) {
    const gitignorePath = path.join(CONFIG.SRC, '.gitignore');
    gitignoreMatcher = parseGitignore(gitignorePath, CONFIG.SRC, verbose);
    if (gitignoreMatcher) {
      verbose('✓ Using .gitignore patterns to filter files');
    } else {
      verbose('✓ No .gitignore found or failed to parse');
    }
  }

  // Scan codebase
  log('\n🔍 Scanning codebase...', 'info');
  const usedKeysData = {
    keys: new Set(),
    dynamicKeys: [],
    locations: {}
  };

  let filesScanned = 0;

  for (const file of walk(CONFIG.SRC, CONFIG, IGNORED_DIRS, isDir, verbose, gitignoreMatcher)) {
    try {
      // Check file size before reading
      const stat = fs.statSync(file);
      if (stat.size > MAX_FILE_SIZE) {
        verbose(`  ⚠ Skipping large file (${(stat.size / 1024 / 1024).toFixed(1)}MB): ${file}`);
        continue;
      }

      filesScanned++;
      const content = fs.readFileSync(file, 'utf8');
      const result = extractKeys(content, path.relative(CONFIG.SRC, file));

      result.keys.forEach(k => usedKeysData.keys.add(k));
      usedKeysData.dynamicKeys.push(...result.dynamicKeys);

      for (const [key, locs] of Object.entries(result.locations)) {
        if (!usedKeysData.locations[key]) {
          usedKeysData.locations[key] = [];
        }
        usedKeysData.locations[key].push(...locs);
      }
    } catch (e) {
      verbose(`  ⚠ Failed to read ${file}: ${e.message}`);
    }
  }

  verbose(`  Scanned ${filesScanned} files`);

  // Analysis
  const baseLoc = CONFIG.LOCALES[0];
  const baseMap = localeMaps[baseLoc] || {};
  const baseKeys = new Set(Object.keys(baseMap));

  // Check missing keys
  const missingByLocale = {};
  for (const locale of CONFIG.LOCALES) {
    const map = localeMaps[locale] || {};
    const missing = [];

    usedKeysData.keys.forEach(key => {
      if (!map[key]) missing.push(key);
    });

    if (missing.length) {
      missingByLocale[locale] = missing.sort();
    }
  }

  // Check parity
  const parity = {};
  for (const locale of CONFIG.LOCALES.slice(1)) {
    const localeKeys = new Set(Object.keys(localeMaps[locale] || {}));
    const missingFromLocale = [...baseKeys].filter(k => !localeKeys.has(k));
    const extraInLocale = [...localeKeys].filter(k => !baseKeys.has(k));

    if (missingFromLocale.length || extraInLocale.length) {
      parity[locale] = {
        missingFromLocale: missingFromLocale.sort(),
        extraInLocale: extraInLocale.sort()
      };
    }
  }

  // Check duplicates (if enabled)
  let duplicates = {};
  if (CONFIG.SHOW_DUPLICATES) {
    duplicates = checkDuplicates(localeMaps);
  }

  // Check parameters
  let paramIssues = [];
  if (CONFIG.CHECK_PARAMS) {
    paramIssues = checkParameters(localeMaps, baseLoc);
  }

  // Check pluralization
  let pluralIssues = [];
  if (CONFIG.CHECK_PLURALS) {
    pluralIssues = checkPluralization(localeMaps, baseLoc);
  }

  // Check intra-file duplicates
  let intraFileDuplicates = [];
  if (CONFIG.CHECK_FILE_DUPLICATES) {
    intraFileDuplicates = checkIntraFileDuplicates(CONFIG, isDir, isFile, verbose);
  }

  // Check orphans
  let orphans = [];
  if (CONFIG.SHOW_ORPHANS) {
    const allLocaleKeys = new Set();
    for (const locale of CONFIG.LOCALES) {
      Object.keys(localeMaps[locale] || {}).forEach(k => allLocaleKeys.add(k));
    }

    // Filter function to check if a key should be ignored
    const shouldIgnoreKey = (key) => {
      // Check exact key matches
      if (CONFIG.IGNORE_KEYS.includes(key)) {
        return true;
      }

      // Check domain prefixes (e.g., "passwords" matches "passwords.reset", "passwords.token")
      for (const domain of CONFIG.IGNORE_DOMAINS) {
        if (key === domain || key.startsWith(domain + '.')) {
          return true;
        }
      }

      // Check regex patterns
      for (const pattern of CONFIG.IGNORE_PATTERNS) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(key)) {
            return true;
          }
        } catch (e) {
          // Invalid regex pattern - log warning in verbose mode
          verbose(`⚠ Invalid regex pattern in ignorePatterns: ${pattern}`);
        }
      }

      return false;
    };

    orphans = [...allLocaleKeys]
      .filter(k => !usedKeysData.keys.has(k))
      .filter(k => !shouldIgnoreKey(k))
      .sort();
  }

  // Calculate coverage
  const totalPossibleKeys = usedKeysData.keys.size * CONFIG.LOCALES.length;
  let providedKeys = 0;
  CONFIG.LOCALES.forEach(loc => {
    const map = localeMaps[loc] || {};
    usedKeysData.keys.forEach(k => {
      if (map[k]) providedKeys++;
    });
  });
  const coverage = totalPossibleKeys ? Math.round((providedKeys / totalPossibleKeys) * 100) : 100;

  // Calculate duration
  const duration = ((Date.now() - t0) / 1000).toFixed(2);

  // ============================================================================
  // REPORTING
  // ============================================================================

  if (!CONFIG.JSON_OUTPUT) {
    console.log(ansi.cyan(`\n${'='.repeat(60)}`));
    console.log(ansi.bold('📊 SCAN RESULTS'));
    console.log(ansi.cyan('='.repeat(60)));
    console.log(`  Source: ${CONFIG.SRC}`);
    console.log(`  Locales: ${CONFIG.LOCALES.join(', ')}`);
    console.log(`  Files scanned: ${filesScanned}`);
    console.log(`  Translation keys used: ${usedKeysData.keys.size}`);
    console.log(`  Coverage: ${ansi.bold(coverage >= 95 ? ansi.green(`${coverage}%`) : coverage >= 80 ? ansi.yellow(`${coverage}%`) : ansi.red(`${coverage}%`))}`);
    console.log(`  Duration: ${duration}s\n`);
  }

  let exitCode = EXIT_CODES.SUCCESS;

  // Report missing keys
  if (Object.keys(missingByLocale).length) {
    if (!CONFIG.JSON_OUTPUT) {
      console.log(ansi.bold(ansi.red('❌ MISSING TRANSLATIONS')));
      for (const [locale, keys] of Object.entries(missingByLocale)) {
        console.log(ansi.red(`\n  ${locale}: ${keys.length} missing keys`));
        keys.slice(0, 10).forEach(k => {
          const locs = usedKeysData.locations[k] || [];
          console.log(`    • ${k}`);
          if (CONFIG.VERBOSE && locs[0]) {
            console.log(ansi.dim(`      ${locs[0].file}:${locs[0].line}`));
          }
        });
        if (keys.length > 10) {
          console.log(ansi.dim(`    ... and ${keys.length - 10} more`));
        }
      }
    }
    exitCode |= EXIT_CODES.MISSING_TRANSLATIONS;
  } else if (!CONFIG.JSON_OUTPUT) {
    console.log(ansi.green('✅ No missing translations\n'));
  }

  // Report parity issues
  if (Object.keys(parity).length) {
    if (!CONFIG.JSON_OUTPUT) {
      console.log(ansi.bold(ansi.yellow(`\n⚖️  PARITY ISSUES (vs ${baseLoc})`)));
      for (const [locale, data] of Object.entries(parity)) {
        if (data.missingFromLocale.length) {
          console.log(ansi.yellow(`\n  ${locale}: ${data.missingFromLocale.length} keys missing`));
          data.missingFromLocale.slice(0, 5).forEach(k => console.log(`    • ${k}`));
          if (data.missingFromLocale.length > 5) {
            console.log(ansi.dim(`    ... and ${data.missingFromLocale.length - 5} more`));
          }
        }
        if (data.extraInLocale.length) {
          console.log(ansi.yellow(`\n  ${locale}: ${data.extraInLocale.length} extra keys`));
          data.extraInLocale.slice(0, 5).forEach(k => console.log(`    • ${k}`));
          if (data.extraInLocale.length > 5) {
            console.log(ansi.dim(`    ... and ${data.extraInLocale.length - 5} more`));
          }
        }
      }
    }
    exitCode |= EXIT_CODES.PARITY_ISSUES;
  } else if (!CONFIG.JSON_OUTPUT) {
    console.log(ansi.green(`✅ Parity OK (base: ${baseLoc})\n`));
  }

  // Report duplicates (if enabled)
  if (CONFIG.SHOW_DUPLICATES && Object.keys(duplicates).length) {
    if (!CONFIG.JSON_OUTPUT) {
      console.log(ansi.bold(ansi.red('\n🔁 DUPLICATE KEYS')));
      for (const [locale, dups] of Object.entries(duplicates)) {
        console.log(ansi.red(`\n  ${locale}: ${dups.length} duplicates`));
        dups.forEach(d => {
          console.log(`    • ${d.key} (×${d.count} in: ${d.files.join(', ')})`);
        });
      }
    }
    exitCode |= EXIT_CODES.DUPLICATE_KEYS;
  } else if (CONFIG.SHOW_DUPLICATES && !CONFIG.JSON_OUTPUT) {
    console.log(ansi.green('✅ No duplicate keys\n'));
  }

  // Report parameter issues
  if (CONFIG.CHECK_PARAMS && paramIssues.length) {
    if (!CONFIG.JSON_OUTPUT) {
      console.log(ansi.bold(ansi.yellow('\n🔧 PARAMETER MISMATCHES')));
      paramIssues.slice(0, 10).forEach(issue => {
        console.log(ansi.yellow(`\n  ${issue.key} [${issue.locale}]`));
        if (issue.missing.length) {
          console.log(ansi.red(`    Missing params: ${issue.missing.join(', ')}`));
        }
        if (issue.extra.length) {
          console.log(ansi.yellow(`    Extra params: ${issue.extra.join(', ')}`));
        }
      });
      if (paramIssues.length > 10) {
        console.log(ansi.dim(`  ... and ${paramIssues.length - 10} more`));
      }
    }
    exitCode |= EXIT_CODES.PARAMETER_MISMATCHES;
  } else if (CONFIG.CHECK_PARAMS && !CONFIG.JSON_OUTPUT) {
    console.log(ansi.green('✅ Parameter consistency OK\n'));
  }

  // Report pluralization issues
  if (CONFIG.CHECK_PLURALS && pluralIssues.length) {
    if (!CONFIG.JSON_OUTPUT) {
      console.log(ansi.bold(ansi.yellow('\n🔢 PLURALIZATION ISSUES')));
      pluralIssues.slice(0, 10).forEach(issue => {
        console.log(ansi.yellow(`\n  ${issue.key} [${issue.locale}]`));
        if (issue.issue === 'missing_pluralization') {
          console.log(ansi.red(`    Missing pluralization (base locale has plural rules)`));
        } else if (issue.issue === 'plural_count_mismatch') {
          console.log(ansi.yellow(`    Plural rule count mismatch`));
          console.log(ansi.dim(`      Base: ${issue.baseRules.length} rules, Locale: ${issue.localeRules.length} rules`));
        }
      });
      if (pluralIssues.length > 10) {
        console.log(ansi.dim(`  ... and ${pluralIssues.length - 10} more`));
      }
    }
    exitCode |= EXIT_CODES.PLURALIZATION_ISSUES;
  } else if (CONFIG.CHECK_PLURALS && !CONFIG.JSON_OUTPUT) {
    console.log(ansi.green('✅ Pluralization consistency OK\n'));
  }

  // Report intra-file duplicates
  if (CONFIG.CHECK_FILE_DUPLICATES && intraFileDuplicates.length) {
    if (!CONFIG.JSON_OUTPUT) {
      console.log(ansi.bold(ansi.red('\n⚠️  DUPLICATE KEYS WITHIN FILES')));
      console.log(ansi.dim('  (Same key appears multiple times - second value overwrites first)\n'));

      intraFileDuplicates.forEach(issue => {
        console.log(ansi.red(`  ${issue.locale}/${issue.file}:`));
        issue.duplicates.forEach(dup => {
          const displayKey = dup.fullPath || dup.key;
          console.log(ansi.yellow(`    • ${displayKey} (×${dup.count} at lines: ${dup.lines.join(', ')})`));
        });
        console.log();
      });
    }
    exitCode |= EXIT_CODES.INTRA_FILE_DUPLICATES;
  } else if (CONFIG.CHECK_FILE_DUPLICATES && !CONFIG.JSON_OUTPUT) {
    console.log(ansi.green('✅ No duplicate keys within files\n'));
  }

  // Report dynamic keys (warning)
  if (usedKeysData.dynamicKeys.length && CONFIG.VERBOSE && !CONFIG.JSON_OUTPUT) {
    console.log(ansi.bold(ansi.magenta('\n⚠️  DYNAMIC KEYS DETECTED')));
    console.log(ansi.dim('  (These cannot be validated automatically)'));
    const unique = [...new Set(usedKeysData.dynamicKeys.map(d => d.file))];
    unique.slice(0, 5).forEach(file => {
      console.log(ansi.magenta(`  • ${file}`));
    });
    if (unique.length > 5) {
      console.log(ansi.dim(`  ... in ${unique.length - 5} more files`));
    }
    console.log();
  }

  // Report orphans
  if (CONFIG.SHOW_ORPHANS && orphans.length) {
    if (!CONFIG.JSON_OUTPUT) {
      console.log(ansi.bold(ansi.yellow(`\n👻 ORPHAN KEYS: ${orphans.length}`)));
      console.log(ansi.dim('  (Defined in lang files but not used in code)'));
      orphans.slice(0, 10).forEach(k => console.log(`    • ${k}`));
      if (orphans.length > 10) {
        console.log(ansi.dim(`  ... and ${orphans.length - 10} more`));
      }
      console.log();
    }
    if (CONFIG.FAIL_ON_ORPHANS) exitCode |= EXIT_CODES.ORPHAN_KEYS;
  } else if (CONFIG.SHOW_ORPHANS && !CONFIG.JSON_OUTPUT) {
    console.log(ansi.green('✅ No orphan keys\n'));
  }

  // ============================================================================
  // JSON OUTPUT
  // ============================================================================

  if (CONFIG.JSON_OUTPUT) {
    const output = {
      success: exitCode === EXIT_CODES.SUCCESS,
      exitCode,
      stats: {
        source: CONFIG.SRC,
        locales: CONFIG.LOCALES,
        filesScanned,
        translationKeysUsed: usedKeysData.keys.size,
        coverage,
        duration: parseFloat(duration),
      },
      issues: {
        missingTranslations: Object.keys(missingByLocale).length > 0 ? missingByLocale : null,
        parityIssues: Object.keys(parity).length > 0 ? parity : null,
        duplicateKeys: Object.keys(duplicates).length > 0 ? duplicates : null,
        parameterMismatches: paramIssues.length > 0 ? paramIssues : null,
        pluralizationIssues: pluralIssues.length > 0 ? pluralIssues : null,
        intraFileDuplicates: intraFileDuplicates.length > 0 ? intraFileDuplicates : null,
        orphanKeys: orphans.length > 0 ? orphans : null,
        dynamicKeys: usedKeysData.dynamicKeys.length > 0 ? usedKeysData.dynamicKeys : null,
      },
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(exitCode);
  }

  // ============================================================================
  // HUMAN-READABLE FINAL MESSAGE
  // ============================================================================

  console.log(ansi.cyan('='.repeat(60)));
  if (exitCode === EXIT_CODES.SUCCESS) {
    console.log(ansi.bold(ansi.green('\n✨ All checks passed! Your i18n is in great shape.\n')));
  } else {
    console.log(ansi.bold(ansi.red(`\n❌ Found issues. Exit code: ${exitCode}\n`)));

    // Decode exit code for user
    const issues = [];
    if (exitCode & EXIT_CODES.MISSING_TRANSLATIONS) issues.push('Missing translations');
    if (exitCode & EXIT_CODES.PARITY_ISSUES) issues.push('Parity issues');
    if (exitCode & EXIT_CODES.DUPLICATE_KEYS) issues.push('Duplicate keys (across files)');
    if (exitCode & EXIT_CODES.PARAMETER_MISMATCHES) issues.push('Parameter mismatches');
    if (exitCode & EXIT_CODES.PLURALIZATION_ISSUES) issues.push('Pluralization issues');
    if (exitCode & EXIT_CODES.INTRA_FILE_DUPLICATES) issues.push('Duplicate keys within files');
    if (exitCode & EXIT_CODES.ORPHAN_KEYS) issues.push('Orphan keys');

    if (issues.length) {
      console.log(ansi.yellow(`Issues detected: ${issues.join(', ')}`));
      console.log();
    }
  }

  process.exit(exitCode);
})();
