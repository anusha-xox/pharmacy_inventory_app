# Testing Guide - Hospital Pharmacy System

## Quick Start

Run all data consistency tests:

```bash
cd app
python test_data_consistency.py
```

## What Gets Tested

### 🔍 24 Comprehensive Tests Covering:

1. **Database Schema** (5 tests)
   - Table existence and structure
   - Foreign key constraints
   - CHECK constraints (roles, quantities)
   - UNIQUE constraints (usernames)

2. **Data Consistency** (5 tests)
   - Stock movements match batch quantities
   - Bill totals = sum of line items
   - Line totals = quantity × price
   - Medicine stock = sum of batch quantities
   - No orphaned records

3. **Business Logic** (6 tests)
   - Batch number format validation
   - Bill number format validation
   - Low stock alert detection
   - Expiring soon detection (90 days)
   - Expired batch detection
   - Active/inactive filtering

4. **Data Integrity** (6 tests)
   - No negative quantities
   - No negative prices
   - Discounts don't exceed subtotals
   - Valid date formats
   - Expiry dates after adding dates
   - Non-negative reorder levels

5. **Stock Movements** (2 tests)
   - Sales recorded in stock movements
   - Batch additions recorded in stock movements

## Running Tests

### Option 1: Custom Test Runner (Recommended)
```bash
cd app
python test_data_consistency.py
```

**Output:**
- Detailed test execution log
- Clear pass/fail indicators (✓/✗)
- Summary statistics
- Failed test details (if any)

### Option 2: Pytest
```bash
cd app
pytest test_data_consistency.py -v
```

**Output:**
- Standard pytest format
- Percentage completion
- Warnings (if any)

### Option 3: Pytest with Short Traceback
```bash
cd app
pytest test_data_consistency.py -v --tb=short
```

## Test Database

- Tests use a **separate database** (`test_pharmacy.db`)
- Created fresh for each test run
- Populated with sample data
- Automatically cleaned up after tests
- **Production database is never affected**

## Expected Results

✅ **All 24 tests should PASS**

```
================================================================================
TEST SUMMARY
================================================================================
Total Tests: 24
Passed: 24 (100.0%)
Failed: 0 (0.0%)

================================================================================
✓ ALL TESTS PASSED - DATA CONSISTENCY VERIFIED
================================================================================
```

## When to Run Tests

### ✅ Before Deployment
Ensure data consistency before pushing changes to production

### ✅ After Database Changes
Verify schema modifications don't break constraints

### ✅ After Code Changes
Confirm business logic changes maintain data integrity

### ✅ Periodic Health Checks
Run weekly/monthly to detect data drift

### ✅ After Data Migration
Validate data integrity after importing/migrating data

## Troubleshooting

### Missing Dependencies
```bash
cd app
pip install -r requirements.txt
```

### Import Errors
Ensure you're in the `app` directory:
```bash
cd app
python test_data_consistency.py
```

### Database Locked
If test database is locked, remove it:
```bash
rm app/test_pharmacy.db
```

## Adding New Tests

To add a new test, edit `test_data_consistency.py`:

```python
class TestYourCategory:
    """Test description"""
    
    def test_your_feature(self):
        """Test what this validates"""
        setup_test_db()
        conn = get_test_conn()
        
        # Your test logic here
        result = conn.execute("SELECT ...").fetchone()
        assert result['value'] == expected_value, "Error message"
        
        conn.close()
```

## Test Files

- **`test_data_consistency.py`**: Main test suite (24 tests)
- **`TEST_REPORT.md`**: Detailed test report and findings
- **`README_TESTING.md`**: This guide

## CI/CD Integration

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run Data Consistency Tests
  run: |
    cd app
    pip install -r requirements.txt
    python test_data_consistency.py
```

## Support

For issues or questions about testing:
1. Check `TEST_REPORT.md` for detailed test descriptions
2. Review test output for specific failure messages
3. Verify all dependencies are installed
4. Ensure you're using Python 3.12+

---

**Last Updated:** 2026-06-19  
**Test Suite Version:** 1.0  
**Total Tests:** 24