from datetime import datetime, timedelta, date
from pathlib import Path
import os
import sqlite3
import smtplib
from email.message import EmailMessage
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "pharmacy.db"

app = FastAPI(title="Hospital Pharmacy Inventory & Billing System")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def d(row):
    return dict(row) if row else None


def init_db():
    conn = db()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL DEFAULT 'demo123',
        role TEXT NOT NULL CHECK(role IN ('admin','desk')),
        is_active INTEGER NOT NULL DEFAULT 1,
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
        customer_email TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        discount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Cash',
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
    """)
    if conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 0:
        conn.executemany("INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)", [
            ("Admin", "admin", "demo123", "admin"), ("Desk User", "desk", "demo123", "desk")])
        meds = [
            ("Paracetamol", "500mg", "Tablet", "Calpol", 15, 20),
            ("Amoxicillin", "250mg", "Capsule", "Cipla", 32, 15),
            ("Cetirizine", "10mg", "Tablet", "Dr Reddy", 8, 20),
            ("Ibuprofen", "400mg", "Tablet", "Abbott", 20, 20),
            ("Azithromycin", "500mg", "Tablet", "Sun Pharma", 45, 10),
        ]
        conn.executemany("INSERT INTO medicines(name,strength,category,manufacturer,unit_price,reorder_level) VALUES(?,?,?,?,?,?)", meds)
        batches = [(1,"PCT24A",100,"2026-08-31",8,"Medlife Pharma"),(1,"PCT24B",50,"2026-12-31",8.2,"Medlife Pharma"),(2,"AMX24B",80,"2026-10-15",18,"HealthRx"),(3,"CTZ24C",120,"2026-11-30",3,"MediSupply"),(4,"IBU24A",60,"2026-09-05",11,"HealthRx"),(5,"AZI24A",15,"2026-06-20",28,"MediSupply")]
        conn.executemany("INSERT INTO medicine_batches(medicine_id,batch_no,quantity_available,expiry_date,purchase_price,supplier) VALUES(?,?,?,?,?,?)", batches)
        for med_id, batch_no, qty, *_ in batches:
            bid = conn.execute("SELECT batch_id FROM medicine_batches WHERE medicine_id=? AND batch_no=?", (med_id, batch_no)).fetchone()["batch_id"]
            conn.execute("INSERT INTO stock_movements(medicine_id,batch_id,movement_type,quantity_change,notes,created_by) VALUES(?,?, 'stock_added', ?, 'Initial stock seed', 1)", (med_id, bid, qty))
    conn.commit(); conn.close()


class LoginIn(BaseModel):
    username: str
    password: str
    role: str
class UserIn(BaseModel):
    name: str; username: str; password: str = "demo123"; role: str
class MedicineIn(BaseModel):
    name: str; strength: Optional[str]=""; category: Optional[str]=""; manufacturer: Optional[str]=""; unit_price: float = Field(ge=0); reorder_level: int = Field(default=10, ge=0)
class MedicineUpdate(MedicineIn):
    is_active: int = 1
class BatchIn(BaseModel):
    medicine_id: int; batch_no: str; quantity_available: int = Field(ge=0); expiry_date: str; purchase_price: float = Field(default=0, ge=0); supplier: Optional[str]=""; created_by: int = 1
class BillItemIn(BaseModel):
    medicine_id: int; quantity: int = Field(gt=0); batch_id: Optional[int] = None
class BillIn(BaseModel):
    customer_name: Optional[str]="Walk-in Customer"; customer_email: Optional[str]=""; created_by: int = 2; items: list[BillItemIn]; discount: float = 0; payment_method: str = "Cash"
class EmailBillIn(BaseModel):
    to_email: str
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_server: Optional[str] = None
    smtp_port: Optional[int] = None

@app.on_event("startup")
def startup(): init_db()

@app.get("/", response_class=HTMLResponse)
def home(request: Request): return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/login")
def login(payload: LoginIn):
    conn = db(); row = conn.execute("SELECT user_id,name,username,role FROM users WHERE username=? AND password=? AND role=? AND is_active=1", (payload.username, payload.password, payload.role)).fetchone(); conn.close()
    if not row: raise HTTPException(401, "Invalid login. Demo: admin/demo123 or desk/demo123")
    return d(row)

@app.get("/api/users")
def users():
    conn=db(); rows=conn.execute("SELECT user_id,name,username,role,is_active,created_at FROM users ORDER BY role,name").fetchall(); conn.close(); return [d(r) for r in rows]
@app.post("/api/users")
def add_user(u:UserIn):
    conn=db()
    try:
        cur=conn.execute("INSERT INTO users(name,username,password,role) VALUES(?,?,?,?)", (u.name,u.username,u.password,u.role)); conn.commit(); return {"user_id": cur.lastrowid}
    except sqlite3.IntegrityError: raise HTTPException(400,"Username already exists")
    finally: conn.close()
@app.patch("/api/users/{user_id}/toggle")
def toggle_user(user_id:int):
    conn=db(); conn.execute("UPDATE users SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE user_id=?",(user_id,)); conn.commit(); conn.close(); return {"ok":True}

@app.get("/api/medicines")
def medicines(q: str = "", include_inactive: int = 0):
    conn=db(); active_clause = "" if include_inactive else "AND m.is_active=1"
    rows=conn.execute(f"""
    SELECT m.*, COALESCE(SUM(CASE WHEN b.expiry_date >= date('now') THEN b.quantity_available ELSE 0 END),0) total_stock,
    MIN(CASE WHEN b.quantity_available>0 AND b.expiry_date >= date('now') THEN b.expiry_date END) nearest_expiry
    FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id=m.medicine_id
    WHERE (m.name || ' ' || IFNULL(m.strength,'') || ' ' || IFNULL(m.manufacturer,'')) LIKE ? {active_clause}
    GROUP BY m.medicine_id ORDER BY m.is_active DESC, m.name""", (f"%{q}%",)).fetchall(); conn.close(); return [d(r) for r in rows]
@app.post("/api/medicines")
def add_medicine(m:MedicineIn):
    conn=db(); cur=conn.execute("INSERT INTO medicines(name,strength,category,manufacturer,unit_price,reorder_level) VALUES(?,?,?,?,?,?)", (m.name,m.strength,m.category,m.manufacturer,m.unit_price,m.reorder_level)); conn.commit(); conn.close(); return {"medicine_id":cur.lastrowid}
@app.put("/api/medicines/{medicine_id}")
def update_medicine(medicine_id:int,m:MedicineUpdate):
    conn=db(); conn.execute("UPDATE medicines SET name=?,strength=?,category=?,manufacturer=?,unit_price=?,reorder_level=?,is_active=? WHERE medicine_id=?", (m.name,m.strength,m.category,m.manufacturer,m.unit_price,m.reorder_level,m.is_active,medicine_id)); conn.commit(); conn.close(); return {"ok":True}
@app.patch("/api/medicines/{medicine_id}/toggle")
def toggle_medicine(medicine_id:int):
    conn=db(); conn.execute("UPDATE medicines SET is_active=CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE medicine_id=?",(medicine_id,)); conn.commit(); conn.close(); return {"ok":True}

@app.get("/api/medicines/{medicine_id}/batches")
def batches(medicine_id:int, active_only:int=1):
    conn=db(); clause="AND quantity_available>0 AND expiry_date>=date('now')" if active_only else ""
    rows=conn.execute(f"SELECT * FROM medicine_batches WHERE medicine_id=? {clause} ORDER BY expiry_date ASC", (medicine_id,)).fetchall(); conn.close(); return [d(r) for r in rows]
@app.post("/api/batches")
def add_batch(b:BatchIn):
    conn=db(); cur=conn.execute("INSERT INTO medicine_batches(medicine_id,batch_no,quantity_available,expiry_date,purchase_price,supplier) VALUES(?,?,?,?,?,?)", (b.medicine_id,b.batch_no,b.quantity_available,b.expiry_date,b.purchase_price,b.supplier)); bid=cur.lastrowid
    conn.execute("INSERT INTO stock_movements(medicine_id,batch_id,movement_type,quantity_change,notes,created_by) VALUES(?,?, 'stock_added', ?, 'Batch stock added', ?)", (b.medicine_id,bid,b.quantity_available,b.created_by)); conn.commit(); conn.close(); return {"batch_id":bid}

@app.get("/api/alerts")
def alerts():
    conn=db(); low=conn.execute("""SELECT m.*, COALESCE(SUM(CASE WHEN b.expiry_date>=date('now') THEN b.quantity_available ELSE 0 END),0) total_stock FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id=m.medicine_id WHERE m.is_active=1 GROUP BY m.medicine_id HAVING total_stock <= m.reorder_level ORDER BY total_stock""").fetchall()
    exp=conn.execute("""SELECT b.*,m.name,m.strength FROM medicine_batches b JOIN medicines m ON m.medicine_id=b.medicine_id WHERE b.quantity_available>0 AND b.expiry_date BETWEEN date('now') AND date('now','+90 day') ORDER BY b.expiry_date""").fetchall()
    expired=conn.execute("""SELECT b.*,m.name,m.strength FROM medicine_batches b JOIN medicines m ON m.medicine_id=b.medicine_id WHERE b.quantity_available>0 AND b.expiry_date < date('now') ORDER BY b.expiry_date""").fetchall(); conn.close(); return {"low_stock":[d(r) for r in low],"expiring_soon":[d(r) for r in exp],"expired":[d(r) for r in expired]}

@app.post("/api/bills")
def create_bill(bill:BillIn):
    if not bill.items: raise HTTPException(400,"Cart is empty")
    conn=db()
    try:
        subtotal=0.0; deductions=[]
        for item in bill.items:
            med=conn.execute("SELECT * FROM medicines WHERE medicine_id=? AND is_active=1", (item.medicine_id,)).fetchone()
            if not med: raise HTTPException(404,"Medicine not found or inactive")
            remaining=item.quantity
            if item.batch_id:
                batch_rows=conn.execute("SELECT * FROM medicine_batches WHERE batch_id=? AND medicine_id=? AND quantity_available>0 AND expiry_date>=date('now')", (item.batch_id,item.medicine_id)).fetchall()
            else:
                batch_rows=conn.execute("SELECT * FROM medicine_batches WHERE medicine_id=? AND quantity_available>0 AND expiry_date>=date('now') ORDER BY expiry_date ASC", (item.medicine_id,)).fetchall()
            for batch in batch_rows:
                if remaining<=0: break
                qty=min(remaining,batch["quantity_available"]); line=qty*med["unit_price"]; subtotal+=line; remaining-=qty
                deductions.append({"medicine_id":item.medicine_id,"batch_id":batch["batch_id"],"qty":qty,"unit_price":med["unit_price"],"line_total":line})
            if remaining>0: raise HTTPException(400, f"Not enough stock for {med['name']} {med['strength'] or ''}")
        discount=max(0,min(bill.discount,subtotal)); total=subtotal-discount
        bill_no=f"INV-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        cur=conn.execute("INSERT INTO bills(bill_no,customer_name,customer_email,subtotal,discount,total_amount,payment_method,created_by) VALUES(?,?,?,?,?,?,?,?)", (bill_no,bill.customer_name,bill.customer_email,subtotal,discount,total,bill.payment_method,bill.created_by)); bill_id=cur.lastrowid
        for x in deductions:
            conn.execute("UPDATE medicine_batches SET quantity_available=quantity_available-? WHERE batch_id=?", (x["qty"],x["batch_id"]))
            conn.execute("INSERT INTO bill_items(bill_id,medicine_id,batch_id,quantity,unit_price,line_total) VALUES(?,?,?,?,?,?)", (bill_id,x["medicine_id"],x["batch_id"],x["qty"],x["unit_price"],x["line_total"]))
            conn.execute("INSERT INTO stock_movements(medicine_id,batch_id,movement_type,quantity_change,reference_id,notes,created_by) VALUES(?,?, 'sale', ?, ?, 'Billing deduction', ?)", (x["medicine_id"],x["batch_id"],-x["qty"],bill_id,bill.created_by))
        conn.commit(); return get_bill_data(conn,bill_id)
    finally: conn.close()

def get_bill_data(conn,bill_id:int):
    bill=conn.execute("SELECT b.*,u.name created_by_name FROM bills b LEFT JOIN users u ON u.user_id=b.created_by WHERE bill_id=?", (bill_id,)).fetchone()
    if not bill: raise HTTPException(404,"Bill not found")
    items=conn.execute("""SELECT bi.*,m.name,m.strength,mb.batch_no,mb.expiry_date FROM bill_items bi JOIN medicines m ON m.medicine_id=bi.medicine_id JOIN medicine_batches mb ON mb.batch_id=bi.batch_id WHERE bi.bill_id=? ORDER BY bi.bill_item_id""", (bill_id,)).fetchall()
    out=d(bill); out["items"]=[d(i) for i in items]; return out
@app.get("/api/bills")
def bills():
    conn=db(); rows=conn.execute("SELECT b.*,u.name created_by_name FROM bills b LEFT JOIN users u ON u.user_id=b.created_by ORDER BY b.created_at DESC LIMIT 100").fetchall(); conn.close(); return [d(r) for r in rows]
@app.get("/api/bills/{bill_id}")
def bill_detail(bill_id:int):
    conn=db(); out=get_bill_data(conn,bill_id); conn.close(); return out

@app.get("/api/stock-movements")
def stock_movements():
    conn=db(); rows=conn.execute("""SELECT sm.*,m.name,m.strength,mb.batch_no,u.name created_by_name FROM stock_movements sm JOIN medicines m ON m.medicine_id=sm.medicine_id LEFT JOIN medicine_batches mb ON mb.batch_id=sm.batch_id LEFT JOIN users u ON u.user_id=sm.created_by ORDER BY sm.created_at DESC LIMIT 200""").fetchall(); conn.close(); return [d(r) for r in rows]
@app.get("/api/reports")
def reports():
    conn = db()
    summary = conn.execute("""
        SELECT COALESCE(SUM(total_amount),0) total_sales,
               COUNT(*) total_bills,
               COALESCE(AVG(total_amount),0) avg_bill
        FROM bills
        WHERE date(created_at) >= date('now','-30 day')
    """).fetchone()

    # Today graph: hourly sales from 00:00 to 23:00
    today_rows = conn.execute("""
        SELECT strftime('%H', created_at) bucket,
               SUM(total_amount) sales,
               COUNT(*) bills
        FROM bills
        WHERE date(created_at) = date('now')
        GROUP BY bucket
        ORDER BY bucket
    """).fetchall()
    today_map = {r["bucket"]: d(r) for r in today_rows}
    today = []
    for h in range(24):
        key = f"{h:02d}"
        row = today_map.get(key, {})
        today.append({
            "label": f"{h:02d}:00",
            "sales": float(row.get("sales", 0) or 0),
            "bills": int(row.get("bills", 0) or 0)
        })

    # Week graph: daily sales for the last 7 days including today
    week_rows = conn.execute("""
        SELECT date(created_at) bucket,
               SUM(total_amount) sales,
               COUNT(*) bills
        FROM bills
        WHERE date(created_at) >= date('now','-6 day')
        GROUP BY bucket
        ORDER BY bucket
    """).fetchall()
    week_map = {r["bucket"]: d(r) for r in week_rows}
    week = []
    for i in range(6, -1, -1):
        dt = date.today() - timedelta(days=i)
        key = dt.isoformat()
        row = week_map.get(key, {})
        week.append({
            "label": dt.strftime('%d %b'),
            "sales": float(row.get("sales", 0) or 0),
            "bills": int(row.get("bills", 0) or 0)
        })

    # Month graph: daily sales for the last 30 days including today
    month_rows = conn.execute("""
        SELECT date(created_at) bucket,
               SUM(total_amount) sales,
               COUNT(*) bills
        FROM bills
        WHERE date(created_at) >= date('now','-29 day')
        GROUP BY bucket
        ORDER BY bucket
    """).fetchall()
    month_map = {r["bucket"]: d(r) for r in month_rows}
    month = []
    for i in range(29, -1, -1):
        dt = date.today() - timedelta(days=i)
        key = dt.isoformat()
        row = month_map.get(key, {})
        month.append({
            "label": dt.strftime('%d %b'),
            "sales": float(row.get("sales", 0) or 0),
            "bills": int(row.get("bills", 0) or 0)
        })

    top = conn.execute("""
        SELECT m.name || ' ' || IFNULL(m.strength,'') medicine, SUM(bi.quantity) qty
        FROM bill_items bi
        JOIN medicines m ON m.medicine_id=bi.medicine_id
        JOIN bills b ON b.bill_id=bi.bill_id
        WHERE date(b.created_at)>=date('now','-30 day')
        GROUP BY m.medicine_id
        ORDER BY qty DESC
        LIMIT 5
    """).fetchall()
    conn.close()
    return {
        "summary": d(summary),
        "charts": {"today": today, "week": week, "month": month},
        "daily": week,  # backward compatible fallback for older app.js
        "top_medicines": [d(r) for r in top]
    }


def bill_email_body(b):
    lines=[f"Bill No: {b['bill_no']}", f"Customer: {b.get('customer_name') or 'Walk-in Customer'}", f"Date: {b['created_at']}", f"Payment: {b['payment_method']}", "", "Items:"]
    for i in b["items"]:
        lines.append(f"- {i['name']} {i.get('strength') or ''} | Batch {i['batch_no']} | Qty {i['quantity']} | ₹{i['unit_price']:.2f} | ₹{i['line_total']:.2f}")
    lines += ["", f"Subtotal: ₹{b['subtotal']:.2f}", f"Discount: ₹{b['discount']:.2f}", f"Total: ₹{b['total_amount']:.2f}", "", "Thank you."]
    return "\n".join(lines)

@app.post("/api/bills/{bill_id}/email")
def email_bill(bill_id:int, payload:EmailBillIn):
    conn=db(); b=get_bill_data(conn,bill_id); conn.close()
    smtp_server=payload.smtp_server or os.getenv("SMTP_SERVER","smtp.gmail.com")
    smtp_port=payload.smtp_port or int(os.getenv("SMTP_PORT","587"))
    smtp_username=payload.smtp_username or os.getenv("SMTP_USERNAME")
    smtp_password=payload.smtp_password or os.getenv("SMTP_PASSWORD")
    if not smtp_username or not smtp_password: raise HTTPException(400,"SMTP credentials missing. Set SMTP_USERNAME and SMTP_PASSWORD or enter them in the app.")
    msg=EmailMessage(); msg["Subject"]=f"Pharmacy Bill {b['bill_no']}"; msg["From"]=smtp_username; msg["To"]=payload.to_email; msg.set_content(bill_email_body(b))
    try:
        with smtplib.SMTP(smtp_server,smtp_port) as server:
            server.starttls(); server.login(smtp_username,smtp_password); server.send_message(msg)
        return {"ok":True,"message":f"Bill shared with {payload.to_email}"}
    except Exception as e:
        raise HTTPException(500, f"Unable to send email: {e}")
