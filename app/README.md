# Hospital Pharmacy Inventory & Billing System

Mobile-friendly FastAPI + SQLite prototype for pharmacy inventory management.

## Included

- Login screen with Admin and Desk Personnel roles
- Admin dashboard cards
- Add/edit/disable medicines
- Add batch-wise stock with expiry
- Inventory list with stock and nearest expiry
- Low stock, expired, and near-expiry alerts
- Desk billing flow with medicine search
- Manual batch selection or automatic FEFO deduction
- Cart, discount, payment method, and bill success screen
- Print bill support
- Share bill through Gmail SMTP
- Sales reports with a simple chart
- Stock movement history
- Bill history
- User management

## Run locally

```bash
cd pharmacy_inventory_app
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## Demo users

```text
Admin: admin / demo123
Desk:  desk / demo123
```

## Gmail SMTP sharing

For Gmail, use an **App Password**, not your normal Gmail password.

Option 1: enter SMTP credentials in the app when clicking **Share via Gmail SMTP**.

Option 2: set environment variables before starting the server:

```bash
export SMTP_SERVER=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USERNAME=yourgmail@gmail.com
export SMTP_PASSWORD=your_gmail_app_password
uvicorn main:app --reload
```

The bill email includes bill number, customer name, item details, batch number, quantity, subtotal, discount, total, and payment mode.

## Notes

This is an MVP prototype. Passwords are stored plainly for demo simplicity. For production, use password hashing, proper sessions/JWT, HTTPS, role-based authorization middleware, audit controls, and database migrations.
