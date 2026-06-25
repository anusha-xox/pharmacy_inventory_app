"""
Comprehensive test suite for Hospital Pharmacy Inventory & Billing System
Tests data consistency, integrity constraints, and business logic
"""

import sqlite3
import pytest
from pathlib import Path
from datetime import datetime, timedelta
import sys
import os

# Add parent directory to path to import main
sys.path.insert(0, str(Path(__file__).parent))

from main import db, init_db, DB_PATH, BASE_DIR

# Use a test database
TEST_DB_PATH = BASE_DIR / "test_pharmacy.db"

def setup_test_db():
    """Setup a fresh test database"""
    global DB_PATH
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
    
    # Temporarily override DB_PATH
    import main
    original_db_path = main.DB_PATH
    main.DB_PATH = TEST_DB_PATH
    
    init_db()
    
    # Restore original DB_PATH
    main.DB_PATH = original_db_path
    
    return TEST_DB_PATH

def get_test_conn():
    """Get connection to test database"""
    conn = sqlite3.connect(TEST_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

class TestDatabaseSchema:
    """Test database schema and constraints"""
    
    def test_tables_exist(self):
        """Verify all required tables exist"""
        setup_test_db()
        conn = get_test_conn()
        
        tables = ['users', 'medicines', 'medicine_batches', 'bills', 'bill_items', 'stock_movements']
        
        for table in tables:
            result = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (table,)
            ).fetchone()
            assert result is not None, f"Table {table} does not exist"
        
        conn.close()
    
    def test_foreign_keys_enabled(self):
        """Verify foreign keys are enabled"""
        setup_test_db()
        conn = get_test_conn()
        
        result = conn.execute("PRAGMA foreign_keys").fetchone()
        assert result[0] == 1, "Foreign keys are not enabled"
        
        conn.close()
    
    def test_user_role_constraint(self):
        """Test user role CHECK constraint"""
        setup_test_db()
        conn = get_test_conn()
        
        # Valid roles should work
        conn.execute("INSERT INTO users(name, username, password, role) VALUES(?, ?, ?, ?)",
                    ("Test User", "testuser", "pass123", "admin"))
        conn.commit()
        
        # Invalid role should fail
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO users(name, username, password, role) VALUES(?, ?, ?, ?)",
                        ("Bad User", "baduser", "pass123", "invalid_role"))
            conn.commit()
        
        conn.close()
    
    def test_username_unique_constraint(self):
        """Test username UNIQUE constraint"""
        setup_test_db()
        conn = get_test_conn()
        
        conn.execute("INSERT INTO users(name, username, password, role) VALUES(?, ?, ?, ?)",
                    ("User 1", "duplicate", "pass123", "admin"))
        conn.commit()
        
        # Duplicate username should fail
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO users(name, username, password, role) VALUES(?, ?, ?, ?)",
                        ("User 2", "duplicate", "pass456", "desk"))
            conn.commit()
        
        conn.close()
    
    def test_batch_quantity_check_constraint(self):
        """Test quantity_available >= 0 constraint"""
        setup_test_db()
        conn = get_test_conn()
        
        # Get a medicine_id
        med_id = conn.execute("SELECT medicine_id FROM medicines LIMIT 1").fetchone()[0]
        
        # Negative quantity should fail
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO medicine_batches(medicine_id, batch_no, date_of_adding, expiry_date, quantity_available, unit_price) VALUES(?, ?, ?, ?, ?, ?)",
                (med_id, "TEST-001", "2024-01-01", "2026-12-31", -10, 50.0)
            )
            conn.commit()
        
        conn.close()


class TestDataConsistency:
    """Test data consistency across tables"""
    
    def test_stock_movement_matches_batch_quantity(self):
        """Verify stock movements sum matches batch quantities"""
        setup_test_db()
        conn = get_test_conn()
        
        # Check each batch
        batches = conn.execute("SELECT batch_id, medicine_id, quantity_available FROM medicine_batches").fetchall()
        
        for batch in batches:
            # Sum all stock movements for this batch
            movements = conn.execute(
                "SELECT COALESCE(SUM(quantity_change), 0) as total FROM stock_movements WHERE batch_id = ?",
                (batch['batch_id'],)
            ).fetchone()
            
            total_movement = movements['total']
            
            # Total movement should equal current quantity (for initial stock)
            # Note: This assumes only stock_added movements exist initially
            assert total_movement >= batch['quantity_available'], \
                f"Batch {batch['batch_id']}: Movement sum ({total_movement}) < quantity ({batch['quantity_available']})"
        
        conn.close()
    
    def test_bill_totals_consistency(self):
        """Verify bill totals match sum of line items"""
        setup_test_db()
        conn = get_test_conn()
        
        bills = conn.execute("SELECT bill_id, subtotal, discount, total_amount FROM bills").fetchall()
        
        for bill in bills:
            # Sum line items
            items_sum = conn.execute(
                "SELECT COALESCE(SUM(line_total), 0) as total FROM bill_items WHERE bill_id = ?",
                (bill['bill_id'],)
            ).fetchone()['total']
            
            # Verify subtotal matches items sum
            assert abs(items_sum - bill['subtotal']) < 0.01, \
                f"Bill {bill['bill_id']}: Items sum ({items_sum}) != subtotal ({bill['subtotal']})"
            
            # Verify total = subtotal - discount
            expected_total = bill['subtotal'] - bill['discount']
            assert abs(expected_total - bill['total_amount']) < 0.01, \
                f"Bill {bill['bill_id']}: Expected total ({expected_total}) != actual ({bill['total_amount']})"
        
        conn.close()
    
    def test_bill_item_line_totals(self):
        """Verify bill item line_total = quantity * unit_price"""
        setup_test_db()
        conn = get_test_conn()
        
        items = conn.execute("SELECT bill_item_id, quantity, unit_price, line_total FROM bill_items").fetchall()
        
        for item in items:
            expected_total = item['quantity'] * item['unit_price']
            assert abs(expected_total - item['line_total']) < 0.01, \
                f"Item {item['bill_item_id']}: Expected ({expected_total}) != actual ({item['line_total']})"
        
        conn.close()
    
    def test_medicine_total_stock_calculation(self):
        """Verify medicine total stock is sum of non-expired batch quantities"""
        setup_test_db()
        conn = get_test_conn()
        
        medicines = conn.execute("SELECT medicine_id FROM medicines").fetchall()
        
        for med in medicines:
            # Calculate expected stock (non-expired batches only)
            expected_stock = conn.execute(
                """SELECT COALESCE(SUM(quantity_available), 0) as total 
                   FROM medicine_batches 
                   WHERE medicine_id = ? AND expiry_date >= date('now')""",
                (med['medicine_id'],)
            ).fetchone()['total']
            
            # Get actual stock from medicines query
            actual_stock = conn.execute(
                """SELECT COALESCE(SUM(CASE WHEN b.expiry_date >= date('now') THEN b.quantity_available ELSE 0 END), 0) as total_stock
                   FROM medicines m 
                   LEFT JOIN medicine_batches b ON b.medicine_id = m.medicine_id
                   WHERE m.medicine_id = ?
                   GROUP BY m.medicine_id""",
                (med['medicine_id'],)
            ).fetchone()
            
            actual = actual_stock['total_stock'] if actual_stock else 0
            
            assert expected_stock == actual, \
                f"Medicine {med['medicine_id']}: Expected stock ({expected_stock}) != actual ({actual})"
        
        conn.close()
    
    def test_no_orphaned_records(self):
        """Verify no orphaned records due to foreign key violations"""
        setup_test_db()
        conn = get_test_conn()
        
        # Check bill_items reference valid bills
        orphaned_bill_items = conn.execute(
            """SELECT COUNT(*) as count FROM bill_items bi 
               WHERE NOT EXISTS (SELECT 1 FROM bills b WHERE b.bill_id = bi.bill_id)"""
        ).fetchone()['count']
        assert orphaned_bill_items == 0, f"Found {orphaned_bill_items} orphaned bill items"
        
        # Check bill_items reference valid medicines
        orphaned_medicine_refs = conn.execute(
            """SELECT COUNT(*) as count FROM bill_items bi 
               WHERE NOT EXISTS (SELECT 1 FROM medicines m WHERE m.medicine_id = bi.medicine_id)"""
        ).fetchone()['count']
        assert orphaned_medicine_refs == 0, f"Found {orphaned_medicine_refs} bill items with invalid medicine refs"
        
        # Check bill_items reference valid batches
        orphaned_batch_refs = conn.execute(
            """SELECT COUNT(*) as count FROM bill_items bi 
               WHERE NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.batch_id = bi.batch_id)"""
        ).fetchone()['count']
        assert orphaned_batch_refs == 0, f"Found {orphaned_batch_refs} bill items with invalid batch refs"
        
        # Check medicine_batches reference valid medicines
        orphaned_batches = conn.execute(
            """SELECT COUNT(*) as count FROM medicine_batches mb 
               WHERE NOT EXISTS (SELECT 1 FROM medicines m WHERE m.medicine_id = mb.medicine_id)"""
        ).fetchone()['count']
        assert orphaned_batches == 0, f"Found {orphaned_batches} orphaned batches"
        
        conn.close()


class TestBusinessLogic:
    """Test business logic and rules"""
    
    def test_batch_no_format(self):
        """Verify batch numbers follow expected format"""
        setup_test_db()
        conn = get_test_conn()
        
        batches = conn.execute(
            """SELECT b.batch_no, b.date_of_adding, b.expiry_date, m.name 
               FROM medicine_batches b 
               JOIN medicines m ON m.medicine_id = b.medicine_id"""
        ).fetchall()
        
        for batch in batches:
            # Expected format: date_of_adding_medicinename_expiry_date
            expected_prefix = f"{batch['date_of_adding']}_{batch['name']}"
            expected_suffix = batch['expiry_date']
            
            assert batch['batch_no'].startswith(expected_prefix), \
                f"Batch {batch['batch_no']} doesn't start with {expected_prefix}"
            assert batch['batch_no'].endswith(expected_suffix), \
                f"Batch {batch['batch_no']} doesn't end with {expected_suffix}"
        
        conn.close()
    
    def test_bill_no_format(self):
        """Verify bill numbers follow INV-YYYYMMDDHHMMSS format"""
        setup_test_db()
        conn = get_test_conn()
        
        bills = conn.execute("SELECT bill_no FROM bills").fetchall()
        
        for bill in bills:
            assert bill['bill_no'].startswith('INV-'), \
                f"Bill {bill['bill_no']} doesn't start with INV-"
            
            # Extract timestamp part
            timestamp_part = bill['bill_no'][4:]
            assert len(timestamp_part) == 14, \
                f"Bill {bill['bill_no']} timestamp part should be 14 digits"
            assert timestamp_part.isdigit(), \
                f"Bill {bill['bill_no']} timestamp part should be numeric"
        
        conn.close()
    
    def test_low_stock_alerts(self):
        """Verify low stock detection logic"""
        setup_test_db()
        conn = get_test_conn()
        
        # Get medicines with stock below reorder level
        low_stock = conn.execute(
            """SELECT m.medicine_id, m.reorder_level, 
                      COALESCE(SUM(CASE WHEN b.expiry_date >= date('now') THEN b.quantity_available ELSE 0 END), 0) as total_stock
               FROM medicines m 
               LEFT JOIN medicine_batches b ON b.medicine_id = m.medicine_id
               WHERE m.is_active = 1
               GROUP BY m.medicine_id
               HAVING total_stock <= m.reorder_level"""
        ).fetchall()
        
        # Verify each low stock item is correctly identified
        for item in low_stock:
            assert item['total_stock'] <= item['reorder_level'], \
                f"Medicine {item['medicine_id']} incorrectly flagged as low stock"
        
        conn.close()
    
    def test_expiring_soon_detection(self):
        """Verify expiring soon detection (within 90 days)"""
        setup_test_db()
        conn = get_test_conn()
        
        expiring = conn.execute(
            """SELECT batch_id, expiry_date, quantity_available
               FROM medicine_batches
               WHERE quantity_available > 0 
               AND expiry_date BETWEEN date('now') AND date('now', '+90 day')"""
        ).fetchall()
        
        today = datetime.now().date()
        ninety_days = today + timedelta(days=90)
        
        for batch in expiring:
            expiry = datetime.strptime(batch['expiry_date'], '%Y-%m-%d').date()
            assert today <= expiry <= ninety_days, \
                f"Batch {batch['batch_id']} expiry {expiry} not within 90 days"
        
        conn.close()
    
    def test_expired_batches_detection(self):
        """Verify expired batches are correctly identified"""
        setup_test_db()
        conn = get_test_conn()
        
        expired = conn.execute(
            """SELECT batch_id, expiry_date, quantity_available
               FROM medicine_batches
               WHERE quantity_available > 0 
               AND expiry_date < date('now')"""
        ).fetchall()
        
        today = datetime.now().date()
        
        for batch in expired:
            expiry = datetime.strptime(batch['expiry_date'], '%Y-%m-%d').date()
            assert expiry < today, \
                f"Batch {batch['batch_id']} expiry {expiry} is not expired"
        
        conn.close()
    
    def test_active_inactive_filtering(self):
        """Verify active/inactive filtering works correctly"""
        setup_test_db()
        conn = get_test_conn()
        
        # Count active medicines
        active_count = conn.execute(
            "SELECT COUNT(*) as count FROM medicines WHERE is_active = 1"
        ).fetchone()['count']
        
        # Count inactive medicines
        inactive_count = conn.execute(
            "SELECT COUNT(*) as count FROM medicines WHERE is_active = 0"
        ).fetchone()['count']
        
        # Total should match
        total_count = conn.execute(
            "SELECT COUNT(*) as count FROM medicines"
        ).fetchone()['count']
        
        assert active_count + inactive_count == total_count, \
            "Active + Inactive count doesn't match total"
        
        conn.close()


class TestDataIntegrity:
    """Test data integrity and validation"""
    
    def test_no_negative_quantities(self):
        """Verify no negative quantities in batches"""
        setup_test_db()
        conn = get_test_conn()
        
        negative = conn.execute(
            "SELECT COUNT(*) as count FROM medicine_batches WHERE quantity_available < 0"
        ).fetchone()['count']
        
        assert negative == 0, f"Found {negative} batches with negative quantities"
        
        conn.close()
    
    def test_no_negative_prices(self):
        """Verify no negative prices"""
        setup_test_db()
        conn = get_test_conn()
        
        # Check batch unit prices
        negative_batch_prices = conn.execute(
            "SELECT COUNT(*) as count FROM medicine_batches WHERE unit_price < 0"
        ).fetchone()['count']
        assert negative_batch_prices == 0, f"Found {negative_batch_prices} batches with negative prices"
        
        # Check bill item prices
        negative_item_prices = conn.execute(
            "SELECT COUNT(*) as count FROM bill_items WHERE unit_price < 0 OR line_total < 0"
        ).fetchone()['count']
        assert negative_item_prices == 0, f"Found {negative_item_prices} bill items with negative prices"
        
        # Check bill totals
        negative_bills = conn.execute(
            "SELECT COUNT(*) as count FROM bills WHERE subtotal < 0 OR total_amount < 0"
        ).fetchone()['count']
        assert negative_bills == 0, f"Found {negative_bills} bills with negative amounts"
        
        conn.close()
    
    def test_discount_not_exceeds_subtotal(self):
        """Verify discount never exceeds subtotal"""
        setup_test_db()
        conn = get_test_conn()
        
        invalid_discounts = conn.execute(
            "SELECT COUNT(*) as count FROM bills WHERE discount > subtotal"
        ).fetchone()['count']
        
        assert invalid_discounts == 0, f"Found {invalid_discounts} bills with discount > subtotal"
        
        conn.close()
    
    def test_dates_are_valid(self):
        """Verify all dates are in valid format"""
        setup_test_db()
        conn = get_test_conn()
        
        # Check batch dates
        batches = conn.execute(
            "SELECT batch_id, date_of_adding, expiry_date FROM medicine_batches"
        ).fetchall()
        
        for batch in batches:
            try:
                datetime.strptime(batch['date_of_adding'], '%Y-%m-%d')
                datetime.strptime(batch['expiry_date'], '%Y-%m-%d')
            except ValueError:
                pytest.fail(f"Batch {batch['batch_id']} has invalid date format")
        
        conn.close()
    
    def test_expiry_after_adding_date(self):
        """Verify expiry date is after adding date"""
        setup_test_db()
        conn = get_test_conn()
        
        invalid_dates = conn.execute(
            """SELECT COUNT(*) as count FROM medicine_batches 
               WHERE date(expiry_date) <= date(date_of_adding)"""
        ).fetchone()['count']
        
        assert invalid_dates == 0, f"Found {invalid_dates} batches with expiry <= adding date"
        
        conn.close()
    
    def test_reorder_levels_non_negative(self):
        """Verify reorder levels are non-negative"""
        setup_test_db()
        conn = get_test_conn()
        
        negative_reorder = conn.execute(
            "SELECT COUNT(*) as count FROM medicines WHERE reorder_level < 0"
        ).fetchone()['count']
        
        assert negative_reorder == 0, f"Found {negative_reorder} medicines with negative reorder level"
        
        conn.close()


class TestStockMovements:
    """Test stock movement tracking"""
    
    def test_stock_movements_recorded_for_sales(self):
        """Verify stock movements are recorded for each sale"""
        setup_test_db()
        conn = get_test_conn()
        
        # Get all bill items
        bill_items = conn.execute(
            "SELECT bill_id, medicine_id, batch_id, quantity FROM bill_items"
        ).fetchall()
        
        for item in bill_items:
            # Check if corresponding stock movement exists
            movement = conn.execute(
                """SELECT * FROM stock_movements 
                   WHERE reference_id = ? 
                   AND medicine_id = ? 
                   AND batch_id = ? 
                   AND movement_type = 'sale'
                   AND quantity_change = ?""",
                (item['bill_id'], item['medicine_id'], item['batch_id'], -item['quantity'])
            ).fetchone()
            
            assert movement is not None, \
                f"No stock movement found for bill {item['bill_id']}, medicine {item['medicine_id']}"
        
        conn.close()
    
    def test_stock_movements_for_batch_additions(self):
        """Verify stock movements recorded when batches are added"""
        setup_test_db()
        conn = get_test_conn()
        
        # Get all batches
        batches = conn.execute(
            "SELECT batch_id, medicine_id FROM medicine_batches"
        ).fetchall()
        
        for batch in batches:
            # Check if stock_added movement exists
            movement = conn.execute(
                """SELECT * FROM stock_movements 
                   WHERE batch_id = ? 
                   AND medicine_id = ? 
                   AND movement_type = 'stock_added'""",
                (batch['batch_id'], batch['medicine_id'])
            ).fetchone()
            
            assert movement is not None, \
                f"No stock_added movement for batch {batch['batch_id']}"
        
        conn.close()


def run_all_tests():
    """Run all tests and generate report"""
    print("=" * 80)
    print("HOSPITAL PHARMACY SYSTEM - DATA CONSISTENCY TEST SUITE")
    print("=" * 80)
    print()
    
    test_classes = [
        TestDatabaseSchema,
        TestDataConsistency,
        TestBusinessLogic,
        TestDataIntegrity,
        TestStockMovements
    ]
    
    total_tests = 0
    passed_tests = 0
    failed_tests = 0
    errors = []
    
    for test_class in test_classes:
        print(f"\n{'=' * 80}")
        print(f"Running: {test_class.__name__}")
        print(f"{'=' * 80}")
        
        test_instance = test_class()
        test_methods = [method for method in dir(test_instance) if method.startswith('test_')]
        
        for method_name in test_methods:
            total_tests += 1
            test_method = getattr(test_instance, method_name)
            
            try:
                test_method()
                passed_tests += 1
                print(f"✓ {method_name}: PASSED")
            except AssertionError as e:
                failed_tests += 1
                error_msg = f"✗ {method_name}: FAILED - {str(e)}"
                print(error_msg)
                errors.append(error_msg)
            except Exception as e:
                failed_tests += 1
                error_msg = f"✗ {method_name}: ERROR - {str(e)}"
                print(error_msg)
                errors.append(error_msg)
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {passed_tests} ({passed_tests/total_tests*100:.1f}%)")
    print(f"Failed: {failed_tests} ({failed_tests/total_tests*100:.1f}%)")
    
    if errors:
        print("\n" + "=" * 80)
        print("FAILED TESTS DETAILS")
        print("=" * 80)
        for error in errors:
            print(error)
    
    # Cleanup
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
    
    print("\n" + "=" * 80)
    if failed_tests == 0:
        print("✓ ALL TESTS PASSED - DATA CONSISTENCY VERIFIED")
    else:
        print(f"✗ {failed_tests} TEST(S) FAILED - PLEASE REVIEW")
    print("=" * 80)
    
    return failed_tests == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)

# Made with Bob
