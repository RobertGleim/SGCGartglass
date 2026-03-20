"""
Inventory Reconciliation Script
================================
Reports how many units of each physical manual product have been sold in
historical orders and — optionally — subtracts that count from the current
quantity stored in the database.

Usage
-----
  # Dry-run: print a report without touching the database (default)
  python reconcile_inventory.py

  # Apply: deduct historical sales from current stock (floors at 0)
  python reconcile_inventory.py --apply

Environment variables required (same as the main app):
  DATABASE_URL  or  POSTGRES_URL  — PostgreSQL connection string
"""

import argparse
import os
import sys
import time


# ---------------------------------------------------------------------------
# DB helpers (mirrors backend/db.py connection logic)
# ---------------------------------------------------------------------------

def _preferred_database_url():
    env = os.environ.get("APP_ENV", "").lower()
    if env == "production":
        return (os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL") or "").strip()
    return (os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or "").strip()


def _get_conn():
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        print("ERROR: psycopg (v3) is required.  Run:  pip install psycopg[binary]", file=sys.stderr)
        sys.exit(1)

    raw_url = _preferred_database_url()
    if not raw_url:
        print(
            "ERROR: Set DATABASE_URL or POSTGRES_URL to a PostgreSQL connection string.",
            file=sys.stderr,
        )
        sys.exit(1)

    conninfo = raw_url.replace("postgresql+psycopg://", "postgresql://", 1)
    if conninfo.startswith("postgres://"):
        conninfo = conninfo.replace("postgres://", "postgresql://", 1)

    last_error = None
    for attempt in range(3):
        try:
            conn = psycopg.connect(conninfo, row_factory=dict_row, connect_timeout=5)
            conn.autocommit = False
            return conn
        except psycopg.OperationalError as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.6 * (attempt + 1))
                continue
    raise last_error


# ---------------------------------------------------------------------------
# Report / reconcile logic
# ---------------------------------------------------------------------------

def run(apply: bool):
    conn = _get_conn()
    cursor = conn.cursor()

    # Fetch all non-digital physical manual products
    cursor.execute(
        """
        SELECT id, name, quantity, is_digital_download
        FROM   manual_products
        WHERE  (is_digital_download IS NULL OR is_digital_download = 0 OR is_digital_download = false)
        ORDER  BY id ASC
        """
    )
    products = cursor.fetchall()

    if not products:
        print("No physical manual products found in the database.")
        conn.close()
        return

    # Sum units sold per product from historical orders
    cursor.execute(
        """
        SELECT  oi.product_id,
                SUM(oi.quantity) AS units_sold
        FROM    customer_order_items oi
        JOIN    customer_orders o ON o.id = oi.order_id
        WHERE   oi.product_type = 'manual'
          AND   o.payment_status IN ('paid', 'completed', 'succeeded')
        GROUP   BY oi.product_id
        """
    )
    sales_rows = cursor.fetchall()
    sales_by_id = {str(row["product_id"]): int(row["units_sold"] or 0) for row in sales_rows}

    # Build report
    col_w = [5, 40, 12, 12, 12]
    header = (
        f"{'ID':<{col_w[0]}}  "
        f"{'Product name':<{col_w[1]}}  "
        f"{'DB qty':<{col_w[2]}}  "
        f"{'Units sold':<{col_w[3]}}  "
        f"{'Adjusted qty':<{col_w[4]}}"
    )
    divider = "-" * len(header)

    print()
    print("Inventory Reconciliation Report")
    print("=" * len(header))
    print(header)
    print(divider)

    updates = []
    for p in products:
        pid = str(p["id"])
        units_sold = sales_by_id.get(pid, 0)
        current_qty = int(p["quantity"] or 0)
        adjusted = max(0, current_qty - units_sold)
        needs_change = adjusted != current_qty
        flag = "  <-- will update" if (apply and needs_change) else ("  <-- change needed" if needs_change else "")
        name = str(p["name"] or "")[:col_w[1]]
        print(
            f"{pid:<{col_w[0]}}  "
            f"{name:<{col_w[1]}}  "
            f"{current_qty:<{col_w[2]}}  "
            f"{units_sold:<{col_w[3]}}  "
            f"{adjusted:<{col_w[4]}}"
            f"{flag}"
        )
        if needs_change:
            updates.append((adjusted, p["id"]))

    print(divider)
    print(f"\n{len(products)} product(s) checked.  {len(updates)} require(s) adjustment.")

    if not updates:
        print("Nothing to do — all quantities are already consistent.")
        conn.close()
        return

    if not apply:
        print(
            "\nDry-run mode — no changes written.  "
            "Re-run with --apply to update the database."
        )
        conn.close()
        return

    # Apply updates
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    for new_qty, product_id in updates:
        cursor.execute(
            "UPDATE manual_products SET quantity = %s, updated_at = %s WHERE id = %s",
            (new_qty, now, product_id),
        )
    conn.commit()
    print(f"\n✓ Applied {len(updates)} update(s) to the database.")
    conn.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Reconcile manual product inventory against historical order data."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write adjusted quantities back to the database (default: dry-run).",
    )
    args = parser.parse_args()
    run(apply=args.apply)
