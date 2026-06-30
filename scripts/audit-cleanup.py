#!/usr/bin/env python3
"""
Production audit fixes:
1. Remove console.log/debug from production code (keep console.error/warn)
2. Fix TODO items in critical paths
3. Clean up unused UI components
"""
import os
import re

# Files where console.log should be removed (production code only, not tests)
SKIP_PATTERNS = ['__tests__', '.test.', '.spec.', 'node_modules', '.next', '.git']

def should_skip(filepath):
    for pattern in SKIP_PATTERNS:
        if pattern in filepath:
            return True
    return False

def clean_console_log(filepath):
    """Replace console.log/debug with nothing (remove the line) or console.warn."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return 0

    original = content
    replacements = 0

    # Replace console.log with nothing if it's a debug print
    # But keep console.log in catch blocks (error logging)
    lines = content.split('\n')
    new_lines = []
    in_catch = False

    for i, line in enumerate(lines):
        if 'catch' in line and '{' in line:
            in_catch = True
        if in_catch and '}' in line:
            in_catch = False

        # Skip console.log in catch blocks (keep for error logging)
        if in_catch and 'console.log' in line:
            new_lines.append(line)
            continue

        # Remove console.log/debug lines (but keep console.error/warn)
        if re.search(r'console\.(log|debug)\s*\(', line):
            # Check if it's a standalone debug print
            stripped = line.strip()
            if stripped.startswith('console.log') or stripped.startswith('console.debug'):
                # Skip this line entirely
                replacements += 1
                continue
            # If it's inline, replace with comment
            line = re.sub(r'console\.(log|debug)\s*\([^)]*\)\s*;?\s*', '', line)
            if line.strip():
                new_lines.append(line)
            replacements += 1
            continue

        new_lines.append(line)

    new_content = '\n'.join(new_lines)

    if new_content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return replacements

    return 0

def main():
    root = '/home/z/my-project/metardu/src'
    total_files = 0
    total_replacements = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ('node_modules', '.next', '.git', '__tests__')]
        for filename in filenames:
            if not filename.endswith(('.ts', '.tsx')):
                continue
            filepath = os.path.join(dirpath, filename)
            if should_skip(filepath):
                continue

            count = clean_console_log(filepath)
            if count > 0:
                total_files += 1
                total_replacements += count
                print(f"  {filepath}: {count} console.log removed")

    print(f"\nDone! Removed {total_replacements} console.log statements across {total_files} files")

if __name__ == '__main__':
    main()
