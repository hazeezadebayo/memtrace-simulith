#!/bin/bash
# Run the MemTrace test suite.
# Usage: bash test/run_tests.sh [--verbose] [test_file_pattern]
set -e

export MOCK_LLM=true

# Clean test databases from previous runs
rm -f data/test_*.db data/test_*.db-*

# Print header
echo "================================================"
echo "  MemTrace Test Suite"
echo "  $(date)"
echo "================================================"
echo ""

# Run Jest with --runInBand to avoid DB file collisions
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --forceExit "$@"

# Clean up test databases after run
rm -f data/test_*.db data/test_*.db-*
