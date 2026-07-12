#!/bin/bash
# run_tests_v2.sh

# Enable deterministic mock mode for all tests
export MOCK_LLM=true

# Ensure md directory exists
mkdir -p md
LOG_FILE="md/output_log.md"

# Header
if [ ! -f "$LOG_FILE" ]; then
  echo "# Test Execution Log" > "$LOG_FILE"
fi
echo -e "\n========================================" >> "$LOG_FILE"
echo "Test Execution Log ($(date))" >> "$LOG_FILE"
echo "Running tests in memtrace/test..." >> "$LOG_FILE"
echo "----------------------------------------" >> "$LOG_FILE"

# 1. Isolate Database for Testing (Prevents wiping development users.db)
export TURSO_DATABASE_URL="file:data/test_users.db"
rm -f data/test_users.db data/test_users.db-*

# 1. Jest Unit Tests
echo "## 1. Jest Unit Tests" >> $LOG_FILE
echo "Command: jest" >> $LOG_FILE
node --experimental-vm-modules node_modules/jest/bin/jest.js --forceExit >> $LOG_FILE 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Jest Unit Tests PASSED" >> $LOG_FILE
else
  echo "❌ Jest Unit Tests FAILED" >> $LOG_FILE
fi

# 2. Consolidated Orchestration Suite
echo -e "\n## 2. Consolidated Orchestration Suite" >> $LOG_FILE
echo "Command: node test/orchestration_suite.js" >> $LOG_FILE
node test/orchestration_suite.js >> $LOG_FILE 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Consolidated Orchestration Suite PASSED" >> $LOG_FILE
else
  echo "❌ Consolidated Orchestration Suite FAILED" >> $LOG_FILE
fi

echo -e "\n----------------------------------------" >> $LOG_FILE
echo "Test Run Complete." >> $LOG_FILE
