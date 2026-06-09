# Pharmacy Inventory & Billing System

Mobile-friendly prototype for hospital/pharmacy inventory management.

## Features

- Admin can add medicines to a master DB
- Admin can add batch-wise stock with quantity and expiry date
- Desk personnel can search medicines and create bills
- Billing automatically deducts stock from the master DB
- FEFO logic: First Expiry, First Out
- Low stock and expiry alerts
- SQLite database included automatically on first run

## Run locally

```bash
cd pharmacy_inventory_app
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## API docs

```text
http://127.0.0.1:8000/docs
```

## Roles

Use the dropdown in the top-right:

- Admin: manage medicine master, stock, alerts
- Desk Personnel: billing and automatic stock deduction
