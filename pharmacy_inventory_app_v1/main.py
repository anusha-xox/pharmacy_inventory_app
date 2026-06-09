from datetime import date, datetime, timedelta
from pathlib import Path
import sqlite3
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "pharmacy.db"

app = FastAPI(title="Pharmacy Inventory & Billing System")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def row_to_dict(row):
    return dict(row) if row else None


def init_db():
    conn = db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','desk')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS medicines (
            medicine_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            strength TEXT,
            category TEXT,
            manufacturer TEXT,
            unit_price REAL NOT NULL DEFAULT 0,
            reorder_level INTEGER NOT NULL DEFAULT 10,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS medicine_batches (
            batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            batch_no TEXT NOT NULL,
            quantity_available INTEGER NOT NULL CHECK(quantity_available >= 0),
            expiry_date TEXT NOT NULL,
            purchase_price REAL DEFAULT 0,
            supplier TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id)
        );

        CREATE TABLE IF NOT EXISTS bills (
            bill_id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_no TEXT UNIQUE NOT NULL,
            customer_name TEXT,
            total_amount REAL NOT NULL,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(user_id)
        );

        CREATE TABLE IF NOT EXISTS bill_items (
            bill_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER NOT NULL,
            medicine_id INTEGER NOT NULL,
            batch_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            line_total REAL NOT NULL,
            FOREIGN KEY (bill_id) REFERENCES bills(bill_id),
            FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
            FOREIGN KEY (batch_id) REFERENCES medicine_batches(batch_id)
        );

        CREATE TABLE IF NOT EXISTS stock_movements (
            movement_id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            batch_id INTEGER,
            movement_type TEXT NOT NULL,
            quantity_change INTEGER NOT NULL,
            reference_id INTEGER,
            notes TEXT,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (medicine_id) REFERENCES medicines(medicine_id),
            FOREIGN KEY (batch_id) REFERENCES medicine_batches(batch_id),
            FOREIGN KEY (created_by) REFERENCES users(user_id)
        );
        """
    )

    # Seed users and medicines only if empty
    count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    if count == 0:
        conn.executemany(
            "INSERT INTO users(name, username, role) VALUES (?, ?, ?)",
            [("Admin", "admin", "admin"), ("Desk User", "desk", "desk")],
        )
        medicines = [
            ("Paracetamol", "500mg", "Tablet", "Calpol", 15.0, 20),
            ("Amoxicillin", "250mg", "Capsule", "Cipla", 32.0, 15),
            ("Cetirizine", "10mg", "Tablet", "Dr Reddy", 8.0, 20),
            ("Ibuprofen", "400mg", "Tablet", "Abbott", 20.0, 20),
            ("Azithromycin", "500mg", "Tablet", "Sun Pharma", 45.0, 10),
        ]
        conn.executemany(
            """INSERT INTO medicines(name, strength, category, manufacturer, unit_price, reorder_level)
               VALUES (?, ?, ?, ?, ?, ?)""",
            medicines,
        )
        batches = [
            (1, "PCT24A", 100, "2026-08-31", 8.0, "Medlife Pharma"),
            (1, "PCT24B", 50, "2026-12-31", 8.2, "Medlife Pharma"),
            (2, "AMX24B", 80, "2026-10-15", 18.0, "HealthRx"),
            (3, "CTZ24C", 120, "2026-11-30", 3.0, "MediSupply"),
            (4, "IBU24A", 60, "2026-09-05", 11.0, "HealthRx"),
            (5, "AZI24A", 15, "2026-06-20", 28.0, "MediSupply"),
        ]
        conn.executemany(
            """INSERT INTO medicine_batches(medicine_id, batch_no, quantity_available, expiry_date, purchase_price, supplier)
               VALUES (?, ?, ?, ?, ?, ?)""",
            batches,
        )
        for med_id, batch_no, qty, *_ in batches:
            batch_id = conn.execute(
                "SELECT batch_id FROM medicine_batches WHERE medicine_id=? AND batch_no=?",
                (med_id, batch_no),
            ).fetchone()["batch_id"]
            conn.execute(
                """INSERT INTO stock_movements(medicine_id, batch_id, movement_type, quantity_change, notes, created_by)
                   VALUES (?, ?, 'stock_added', ?, 'Initial stock seed', 1)""",
                (med_id, batch_id, qty),
            )
    conn.commit()
    conn.close()


class MedicineIn(BaseModel):
    name: str
    strength: Optional[str] = ""
    category: Optional[str] = ""
    manufacturer: Optional[str] = ""
    unit_price: float = Field(ge=0)
    reorder_level: int = Field(default=10, ge=0)


class BatchIn(BaseModel):
    medicine_id: int
    batch_no: str
    quantity_available: int = Field(ge=0)
    expiry_date: str
    purchase_price: float = Field(default=0, ge=0)
    supplier: Optional[str] = ""
    created_by: int = 1


class BillItemIn(BaseModel):
    medicine_id: int
    quantity: int = Field(gt=0)


class BillIn(BaseModel):
    customer_name: Optional[str] = "Walk-in Customer"
    created_by: int = 2
    items: list[BillItemIn]


@app.on_event("startup")
def startup():
    init_db()


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/medicines")
def list_medicines(q: str = ""):
    conn = db()
    rows = conn.execute(
        """
        SELECT m.*,
               COALESCE(SUM(CASE WHEN b.expiry_date >= date('now') THEN b.quantity_available ELSE 0 END), 0) AS total_stock,
               MIN(CASE WHEN b.quantity_available > 0 AND b.expiry_date >= date('now') THEN b.expiry_date END) AS nearest_expiry
        FROM medicines m
        LEFT JOIN medicine_batches b ON b.medicine_id = m.medicine_id
        WHERE m.is_active = 1 AND (m.name || ' ' || IFNULL(m.strength,'') || ' ' || IFNULL(m.manufacturer,'')) LIKE ?
        GROUP BY m.medicine_id
        ORDER BY m.name
        """,
        (f"%{q}%",),
    ).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@app.post("/api/medicines")
def create_medicine(payload: MedicineIn):
    conn = db()
    cur = conn.execute(
        """INSERT INTO medicines(name, strength, category, manufacturer, unit_price, reorder_level)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (payload.name, payload.strength, payload.category, payload.manufacturer, payload.unit_price, payload.reorder_level),
    )
    conn.commit()
    med_id = cur.lastrowid
    conn.close()
    return {"medicine_id": med_id, "message": "Medicine created"}


@app.get("/api/batches/{medicine_id}")
def list_batches(medicine_id: int):
    conn = db()
    rows = conn.execute(
        """
        SELECT b.*, m.name, m.strength
        FROM medicine_batches b
        JOIN medicines m ON m.medicine_id = b.medicine_id
        WHERE b.medicine_id = ?
        ORDER BY b.expiry_date ASC
        """,
        (medicine_id,),
    ).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@app.post("/api/batches")
def add_batch(payload: BatchIn):
    conn = db()
    med = conn.execute("SELECT medicine_id FROM medicines WHERE medicine_id=?", (payload.medicine_id,)).fetchone()
    if not med:
        conn.close()
        raise HTTPException(404, "Medicine not found")
    cur = conn.execute(
        """INSERT INTO medicine_batches(medicine_id, batch_no, quantity_available, expiry_date, purchase_price, supplier)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (payload.medicine_id, payload.batch_no, payload.quantity_available, payload.expiry_date, payload.purchase_price, payload.supplier),
    )
    batch_id = cur.lastrowid
    conn.execute(
        """INSERT INTO stock_movements(medicine_id, batch_id, movement_type, quantity_change, notes, created_by)
           VALUES (?, ?, 'stock_added', ?, 'Stock added by admin', ?)""",
        (payload.medicine_id, batch_id, payload.quantity_available, payload.created_by),
    )
    conn.commit()
    conn.close()
    return {"batch_id": batch_id, "message": "Stock added"}


@app.get("/api/alerts")
def alerts(days: int = 60):
    conn = db()
    rows = conn.execute(
        """
        SELECT m.name, m.strength, b.batch_no, b.quantity_available, b.expiry_date,
               CAST(julianday(b.expiry_date) - julianday(date('now')) AS INTEGER) AS days_left
        FROM medicine_batches b
        JOIN medicines m ON m.medicine_id = b.medicine_id
        WHERE b.quantity_available > 0
          AND b.expiry_date <= date('now', ?)
        ORDER BY b.expiry_date ASC
        """,
        (f"+{days} days",),
    ).fetchall()
    low_stock = conn.execute(
        """
        SELECT m.medicine_id, m.name, m.strength, m.reorder_level,
               COALESCE(SUM(b.quantity_available),0) AS total_stock
        FROM medicines m
        LEFT JOIN medicine_batches b ON b.medicine_id = m.medicine_id AND b.expiry_date >= date('now')
        GROUP BY m.medicine_id
        HAVING total_stock <= m.reorder_level
        ORDER BY total_stock ASC
        """
    ).fetchall()
    conn.close()
    return {"expiry_alerts": [row_to_dict(r) for r in rows], "low_stock": [row_to_dict(r) for r in low_stock]}


@app.post("/api/bills")
def create_bill(payload: BillIn):
    if not payload.items:
        raise HTTPException(400, "Bill must contain at least one item")
    conn = db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        total_amount = 0.0
        deductions = []

        for item in payload.items:
            med = conn.execute(
                "SELECT medicine_id, unit_price FROM medicines WHERE medicine_id=? AND is_active=1",
                (item.medicine_id,),
            ).fetchone()
            if not med:
                raise HTTPException(404, f"Medicine {item.medicine_id} not found")

            available = conn.execute(
                """SELECT COALESCE(SUM(quantity_available),0) AS qty
                   FROM medicine_batches
                   WHERE medicine_id=? AND quantity_available > 0 AND expiry_date >= date('now')""",
                (item.medicine_id,),
            ).fetchone()["qty"]
            if available < item.quantity:
                raise HTTPException(400, f"Insufficient stock for medicine_id {item.medicine_id}. Available: {available}")

            remaining = item.quantity
            batches = conn.execute(
                """SELECT batch_id, quantity_available
                   FROM medicine_batches
                   WHERE medicine_id=? AND quantity_available > 0 AND expiry_date >= date('now')
                   ORDER BY expiry_date ASC, batch_id ASC""",
                (item.medicine_id,),
            ).fetchall()

            for b in batches:
                if remaining == 0:
                    break
                deduct = min(remaining, b["quantity_available"])
                remaining -= deduct
                line_total = deduct * med["unit_price"]
                total_amount += line_total
                deductions.append({
                    "medicine_id": item.medicine_id,
                    "batch_id": b["batch_id"],
                    "quantity": deduct,
                    "unit_price": med["unit_price"],
                    "line_total": line_total,
                })

        bill_no = f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        cur = conn.execute(
            "INSERT INTO bills(bill_no, customer_name, total_amount, created_by) VALUES (?, ?, ?, ?)",
            (bill_no, payload.customer_name, total_amount, payload.created_by),
        )
        bill_id = cur.lastrowid

        for d in deductions:
            conn.execute(
                "UPDATE medicine_batches SET quantity_available = quantity_available - ? WHERE batch_id=?",
                (d["quantity"], d["batch_id"]),
            )
            conn.execute(
                """INSERT INTO bill_items(bill_id, medicine_id, batch_id, quantity, unit_price, line_total)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (bill_id, d["medicine_id"], d["batch_id"], d["quantity"], d["unit_price"], d["line_total"]),
            )
            conn.execute(
                """INSERT INTO stock_movements(medicine_id, batch_id, movement_type, quantity_change, reference_id, notes, created_by)
                   VALUES (?, ?, 'sale', ?, ?, 'Billing deduction using FEFO', ?)""",
                (d["medicine_id"], d["batch_id"], -d["quantity"], bill_id, payload.created_by),
            )

        conn.commit()
        return {"bill_id": bill_id, "bill_no": bill_no, "total_amount": total_amount, "items": deductions}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@app.get("/api/bills")
def list_bills():
    conn = db()
    rows = conn.execute(
        """
        SELECT b.*, u.name AS created_by_name
        FROM bills b
        LEFT JOIN users u ON u.user_id = b.created_by
        ORDER BY b.created_at DESC
        LIMIT 50
        """
    ).fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@app.get("/api/reports/summary")
def report_summary():
    conn = db()
    today = conn.execute(
        "SELECT COALESCE(SUM(total_amount),0) AS sales, COUNT(*) AS bills FROM bills WHERE date(created_at)=date('now')"
    ).fetchone()
    all_time = conn.execute(
        "SELECT COALESCE(SUM(total_amount),0) AS sales, COUNT(*) AS bills FROM bills"
    ).fetchone()
    medicines = conn.execute("SELECT COUNT(*) AS c FROM medicines WHERE is_active=1").fetchone()["c"]
    conn.close()
    return {"today": row_to_dict(today), "all_time": row_to_dict(all_time), "medicine_count": medicines}
