"""Invoice management routes for admins and customers."""
from flask import Blueprint, request, jsonify, g
from backend.auth import decode_token
from backend.utils.email import send_email
from datetime import datetime
import secrets
from backend.db import (
    fetch_customer_by_id,
    fetch_customer_by_email,
    create_customer_invoice,
    reserve_next_custom_work_order_number,
    list_customer_invoices,
    list_admin_invoices,
    get_invoice_by_id,
    update_invoice_status,
    update_admin_invoice,
    delete_invoice,
    upsert_customer_cart_item,
)
from backend.models import WorkOrder
import jwt

invoices_bp = Blueprint('invoices', __name__)


def _resolve_work_order_customer_id(work_order):
    """Resolve customer ID from a WorkOrder regardless of model shape."""
    if not work_order:
        return None

    # Newer/legacy compatibility: prefer explicit field when present.
    customer_id = getattr(work_order, 'customer_id', None)
    if customer_id:
        return customer_id

    # Current model stores customer ownership on user_id.
    customer_id = getattr(work_order, 'user_id', None)
    if customer_id:
        return customer_id

    # Fallback to linked project owner if available.
    project = getattr(work_order, 'project', None)
    project_user_id = getattr(project, 'user_id', None) if project else None
    if project_user_id:
        return project_user_id

    return None


def _generate_custom_invoice_number():
    return f"CINV-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"

def login_required(f):
    """Customer authentication decorator."""
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({'error': 'Authentication required'}), 401
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_token(token)
            if payload.get("role") == "customer":
                g.auth_payload = payload
                return f(*args, **kwargs)
            else:
                return jsonify({'error': 'Customer authentication required'}), 403
        except jwt.PyJWTError:
            return jsonify({'error': 'Invalid or expired token'}), 401
    wrapper.__name__ = f.__name__
    return wrapper

def admin_required(f):
    """Admin authentication decorator."""
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({'error': 'Authentication required'}), 401
        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_token(token)
            if payload.get("role") != "customer":
                g.auth_payload = payload
                return f(*args, **kwargs)
            else:
                return jsonify({'error': 'Admin authentication required'}), 403
        except jwt.PyJWTError:
            return jsonify({'error': 'Invalid or expired token'}), 401
    wrapper.__name__ = f.__name__
    return wrapper


# Admin endpoints
@invoices_bp.route('/api/admin/work-orders/<int:work_order_id>/generate-invoice', methods=['POST'])
@admin_required
def admin_generate_invoice(work_order_id):
    """Generate and email an invoice for an approved work order."""
    try:
        # Get the work order
        work_order = WorkOrder.query.get(work_order_id)
        if not work_order:
            return jsonify({'error': 'Work order not found'}), 404

        # Check if work order is in an exportable status
        exportable_statuses = {'Approved', 'In Production', 'Completed'}
        status_value = work_order.status.value if hasattr(work_order.status, 'value') else str(work_order.status)
        if status_value not in exportable_statuses:
            return jsonify({'error': 'Only approved work orders can have invoices generated'}), 400

        customer_id = _resolve_work_order_customer_id(work_order)
        if not customer_id:
            return jsonify({'error': 'Unable to resolve customer for this work order'}), 400

        # Get customer
        customer = fetch_customer_by_id(customer_id)
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404

        # Get payload
        payload = request.get_json(silent=True) or {}
        amount = float(payload.get('amount', 0))
        due_date = (payload.get('due_date') or '').strip()
        notes = (payload.get('notes') or '').strip()

        if amount <= 0:
            return jsonify({'error': 'Invoice amount must be greater than zero'}), 400

        # Create invoice
        invoice_id = create_customer_invoice(
            customer_id=customer_id,
            work_order_id=work_order_id,
            invoice_number=None,  # Will be auto-generated
            amount=amount,
            due_date=due_date or None,
            notes=notes or None,
        )

        invoice = get_invoice_by_id(invoice_id)
        customer_email = customer.get('email', '')
        work_order_number = work_order.work_order_number or f"WO-{work_order_id}"

        email_sent = False
        # Send invoice email notification to customer
        if customer_email:
            email_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #2c3e50;">New Invoice Available</h2>
            <p>Hello {customer.get('first_name', 'Valued Customer')},</p>
            <p>A new invoice has been generated for your work order at SGCG Art Glass.</p>

            <h3 style="color: #2c3e50;">Invoice Details</h3>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
            <ul>
            <li><strong>Invoice Number:</strong> {invoice.get('invoice_number')}</li>
            <li><strong>Work Order Number:</strong> {work_order_number}</li>
            <li><strong>Work Order Status:</strong> {status_value}</li>
            <li><strong>Amount:</strong> ${amount:.2f}</li>
            <li><strong>Status:</strong> {invoice.get('status')}</li>
            {f'<li><strong>Due Date:</strong> {due_date}</li>' if due_date else ''}
            {f'<li><strong>Notes:</strong> {notes}</li>' if notes else ''}
            </ul>
            </div>

            <h3 style="color: #2c3e50; margin-top: 20px;">What's Next?</h3>
            <p>
            <strong>1. Visit Your Portal:</strong><br/>
            Sign in to your customer portal at <a href="https://www.sgcgart.com" style="color: #0066cc; text-decoration: none;">www.sgcgart.com</a> to review and manage your invoice.
            </p>
            <p>
            <strong>2. Add to Cart:</strong><br/>
            From your portal, you can add this invoice to your cart and proceed to payment.
            </p>

            <h3 style="color: #2c3e50;">Questions or Need Assistance?</h3>
            <p>
            If you have any questions about this invoice or need other options, please contact us:
            </p>
            <ul>
            <li><strong>Email:</strong> <a href="mailto:customersupport@sgcgart.com" style="color: #0066cc; text-decoration: none;">customersupport@sgcgart.com</a></li>
            <li><strong>Phone:</strong> Contact us for more information</li>
            <li><strong>Website:</strong> <a href="https://www.sgcgart.com" style="color: #0066cc; text-decoration: none;">www.sgcgart.com</a></li>
            </ul>

            <p style="margin-top: 30px; color: #666;">
            Thank you for your business!<br/>
            <strong>SGCG Art Glass</strong>
            </p>
            </body>
            </html>
            """

            email_sent = send_email(
                customer_email,
                f"New Invoice {invoice.get('invoice_number')} - SGCG Art Glass",
                email_body,
            )

        return jsonify({
            'success': True,
            'invoice': invoice,
            'email_sent': bool(email_sent),
            'message': 'Invoice generated. Customer email notification sent.' if email_sent else 'Invoice generated, but customer email could not be sent.'
        }), 201

    except Exception as e:
        return jsonify({'error': 'Failed to generate invoice: ' + str(e)}), 500


@invoices_bp.route('/api/admin/work-orders/<int:work_order_id>/invoices', methods=['GET'])
@admin_required
def admin_get_work_order_invoices(work_order_id):
    """Get all invoices for a specific work order."""
    try:
        work_order = WorkOrder.query.get(work_order_id)
        if not work_order:
            return jsonify({'error': 'Work order not found'}), 404

        customer_id = _resolve_work_order_customer_id(work_order)
        if not customer_id:
            return jsonify({'error': 'Unable to resolve customer for this work order'}), 400

        invoices = list_customer_invoices(customer_id)
        # Filter to just invoices for this work order
        work_order_invoices = [inv for inv in invoices if inv.get('work_order_id') == work_order_id]

        return jsonify(work_order_invoices), 200

    except Exception as e:
        return jsonify({'error': 'Failed to retrieve invoices: ' + str(e)}), 500


@invoices_bp.route('/api/admin/invoices', methods=['GET'])
@admin_required
def admin_list_all_invoices():
    """List all invoices for admin maintenance."""
    try:
        status_filter = (request.args.get('status') or '').strip().lower() or None
        customer_id_raw = (request.args.get('customer_id') or '').strip()
        customer_id = int(customer_id_raw) if customer_id_raw.isdigit() else None

        if status_filter == 'all':
            status_filter = None

        invoices = list_admin_invoices(status_filter=status_filter, customer_id=customer_id)

        work_order_ids = [inv.get('work_order_id') for inv in invoices if inv.get('work_order_id')]
        work_order_map = {}
        if work_order_ids:
            rows = WorkOrder.query.filter(WorkOrder.id.in_(work_order_ids)).all()
            work_order_map = {row.id: row.work_order_number for row in rows}

        for inv in invoices:
            work_order_id = inv.get('work_order_id')
            if work_order_id:
                inv['work_order_number'] = work_order_map.get(work_order_id)

        return jsonify(invoices), 200
    except Exception as e:
        return jsonify({'error': 'Failed to list invoices: ' + str(e)}), 500


@invoices_bp.route('/api/admin/invoices', methods=['POST'])
@admin_required
def admin_create_custom_invoice():
    """Create a custom invoice not tied to the work-order invoice sequence."""
    try:
        payload = request.get_json(silent=True) or {}
        customer_id_raw = payload.get('customer_id')
        customer_email_raw = (payload.get('customer_email') or '').strip().lower()
        work_order_id_raw = payload.get('work_order_id')
        amount_raw = payload.get('amount')
        due_date = (payload.get('due_date') or '').strip() or None
        notes = (payload.get('notes') or '').strip() or None

        customer = None
        customer_id = None

        if customer_email_raw:
            customer = fetch_customer_by_email(customer_email_raw)
            if not customer:
                return jsonify({'error': 'No customer account found for that email address'}), 404
            customer_id = customer.get('id')
        else:
            try:
                customer_id = int(customer_id_raw)
            except Exception:
                return jsonify({'error': 'Select a customer or enter a customer email'}), 400
            customer = fetch_customer_by_id(customer_id)

        if not customer:
            return jsonify({'error': 'Customer not found'}), 404

        work_order_id = None
        if str(work_order_id_raw or '').strip().isdigit():
            work_order_id = int(work_order_id_raw)

        try:
            amount = float(amount_raw)
        except Exception:
            return jsonify({'error': 'amount must be a number'}), 400

        if amount <= 0:
            return jsonify({'error': 'amount must be greater than zero'}), 400

        custom_number = _generate_custom_invoice_number()
        custom_wo_number = reserve_next_custom_work_order_number()
        combined_notes = f"CWO Number: {custom_wo_number}"
        if notes:
            combined_notes = f"{combined_notes}\n{notes}"

        invoice_id = create_customer_invoice(
            customer_id=customer_id,
            work_order_id=work_order_id,
            invoice_number=custom_number,
            amount=amount,
            due_date=due_date,
            notes=combined_notes,
        )
        invoice = get_invoice_by_id(invoice_id)
        if invoice:
            invoice['work_order_number'] = custom_wo_number

        email_sent = False
        customer_email = (customer.get('email') or customer_email_raw or '').strip()
        if customer_email:
            work_order_number = custom_wo_number

            email_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #2c3e50;">New Invoice Available</h2>
            <p>Hello {customer.get('first_name', 'Valued Customer')},</p>
            <p>A custom invoice has been generated for your account at SGCG Art Glass.</p>

            <h3 style="color: #2c3e50;">Invoice Details</h3>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px;">
            <ul>
            <li><strong>Invoice Number:</strong> {invoice.get('invoice_number')}</li>
            {f'<li><strong>Work Order Number:</strong> {work_order_number}</li>' if work_order_number else ''}
            <li><strong>Amount:</strong> ${amount:.2f}</li>
            <li><strong>Status:</strong> {invoice.get('status')}</li>
            {f'<li><strong>Due Date:</strong> {due_date}</li>' if due_date else ''}
            {f'<li><strong>Notes:</strong> {notes}</li>' if notes else ''}
            </ul>
            </div>

            <h3 style="color: #2c3e50; margin-top: 20px;">What's Next?</h3>
            <p>
            <strong>1. Visit Your Portal:</strong><br/>
            Sign in to your customer portal at <a href="https://www.sgcgart.com" style="color: #0066cc; text-decoration: none;">www.sgcgart.com</a> to review and manage your invoice.
            </p>
            <p>
            <strong>2. Add to Cart:</strong><br/>
            From your portal, you can add this invoice to your cart and proceed to payment.
            </p>

            <h3 style="color: #2c3e50;">Questions or Need Assistance?</h3>
            <p>
            If you have any questions about this invoice or need other options, please contact us:
            </p>
            <ul>
            <li><strong>Email:</strong> <a href="mailto:customersupport@sgcgart.com" style="color: #0066cc; text-decoration: none;">customersupport@sgcgart.com</a></li>
            <li><strong>Phone:</strong> Contact us for more information</li>
            <li><strong>Website:</strong> <a href="https://www.sgcgart.com" style="color: #0066cc; text-decoration: none;">www.sgcgart.com</a></li>
            </ul>

            <p style="margin-top: 30px; color: #666;">
            Thank you for your business!<br/>
            <strong>SGCG Art Glass</strong>
            </p>
            </body>
            </html>
            """
            email_sent = send_email(
                customer_email,
                f"New Invoice {invoice.get('invoice_number')} - SGCG Art Glass",
                email_body,
            )

        return jsonify({'success': True, 'invoice': invoice, 'email_sent': bool(email_sent)}), 201
    except Exception as e:
        return jsonify({'error': 'Failed to create custom invoice: ' + str(e)}), 500


@invoices_bp.route('/api/admin/invoices/<int:invoice_id>', methods=['PUT'])
@admin_required
def admin_update_invoice(invoice_id):
    """Update invoice status/details for admin controls."""
    try:
        invoice = get_invoice_by_id(invoice_id)
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404

        payload = request.get_json(silent=True) or {}
        status = payload.get('status')
        amount = payload.get('amount')
        due_date = payload.get('due_date') if 'due_date' in payload else None
        notes = payload.get('notes') if 'notes' in payload else None

        allowed_statuses = {'open', 'paid', 'overdue', 'on_hold', 'cancelled'}
        if status is not None:
            status = str(status).strip().lower()
            if status not in allowed_statuses:
                return jsonify({'error': f'Invalid status. Allowed: {", ".join(sorted(allowed_statuses))}'}), 400

        if amount is not None:
            try:
                amount = float(amount)
            except Exception:
                return jsonify({'error': 'amount must be a number'}), 400
            if amount <= 0:
                return jsonify({'error': 'amount must be greater than zero'}), 400

        updated = update_admin_invoice(
            invoice_id,
            status=status,
            amount=amount,
            due_date=due_date,
            notes=notes,
        )
        if not updated:
            return jsonify({'error': 'No invoice changes were applied'}), 400

        refreshed = get_invoice_by_id(invoice_id)
        return jsonify({'success': True, 'invoice': refreshed}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to update invoice: ' + str(e)}), 500


@invoices_bp.route('/api/admin/invoices/<int:invoice_id>', methods=['DELETE'])
@admin_required
def admin_delete_invoice(invoice_id):
    """Delete an invoice from admin invoice maintenance."""
    try:
        invoice = get_invoice_by_id(invoice_id)
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404

        deleted = delete_invoice(invoice_id)
        if not deleted:
            return jsonify({'error': 'Failed to delete invoice'}), 500

        return jsonify({'success': True, 'invoice_id': invoice_id}), 200
    except Exception as e:
        return jsonify({'error': 'Failed to delete invoice: ' + str(e)}), 500


# Customer-side invoice endpoints
@invoices_bp.route('/api/customer/invoices', methods=['GET'])
@login_required
def customer_get_invoices():
    """Get all open invoices for the logged-in customer."""
    try:
        customer_id = g.auth_payload.get('customer_id')
        # Default to open invoices so cancelled (customer-deleted) invoices stay hidden.
        status_filter = (request.args.get('status') or 'open').strip().lower()
        if status_filter == 'all':
            status_filter = None

        invoices = list_customer_invoices(customer_id, status_filter=status_filter)
        return jsonify(invoices), 200

    except Exception as e:
        return jsonify({'error': 'Failed to retrieve invoices: ' + str(e)}), 500


@invoices_bp.route('/api/customer/invoices/<int:invoice_id>', methods=['GET'])
@login_required
def customer_get_invoice(invoice_id):
    """Get a specific invoice for the logged-in customer."""
    try:
        customer_id = g.auth_payload.get('customer_id')

        invoice = get_invoice_by_id(invoice_id, customer_id)
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404

        work_order_id = invoice.get('work_order_id')
        if work_order_id:
            work_order = WorkOrder.query.get(work_order_id)
            if work_order:
                invoice['work_order_number'] = work_order.work_order_number

                preview_url = None
                if getattr(work_order, 'project', None) and isinstance(work_order.project.design_data, dict):
                    preview_url = (
                        work_order.project.design_data.get('preview_url')
                        or work_order.project.design_data.get('dataUrl')
                    )
                invoice['work_order_preview_url'] = preview_url

        return jsonify(invoice), 200

    except Exception as e:
        return jsonify({'error': 'Failed to retrieve invoice: ' + str(e)}), 500


@invoices_bp.route('/api/customer/invoices/<int:invoice_id>/add-to-cart', methods=['POST'])
@login_required
def customer_add_invoice_to_cart(invoice_id):
    """Add an invoice item to the customer's cart."""
    try:
        customer_id = g.auth_payload.get('customer_id')

        invoice = get_invoice_by_id(invoice_id, customer_id)
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404

        # Add the invoice as a special cart item
        product_id = f"inv-{invoice_id}"
        upsert_customer_cart_item(customer_id, 'invoice', product_id, 1)

        return jsonify({
            'success': True,
            'message': 'Invoice added to cart'
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to add invoice to cart: ' + str(e)}), 500


@invoices_bp.route('/api/customer/invoices/<int:invoice_id>/update-status', methods=['PUT'])
@login_required
def customer_update_invoice_status(invoice_id):
    """Update the status of an invoice."""
    try:
        customer_id = g.auth_payload.get('customer_id')

        invoice = get_invoice_by_id(invoice_id, customer_id)
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404

        payload = request.get_json(silent=True) or {}
        new_status = (payload.get('status') or '').strip()

        if not new_status:
            return jsonify({'error': 'Status is required'}), 400

        # Only allow certain status transitions
        allowed_statuses = ['open', 'paid', 'overdue', 'cancelled']
        if new_status not in allowed_statuses:
            return jsonify({'error': f'Invalid status. Allowed: {", ".join(allowed_statuses)}'}), 400

        success = update_invoice_status(invoice_id, new_status)
        if not success:
            return jsonify({'error': 'Failed to update invoice status'}), 500

        updated_invoice = get_invoice_by_id(invoice_id, customer_id)
        return jsonify(updated_invoice), 200

    except Exception as e:
        return jsonify({'error': 'Failed to update invoice: ' + str(e)}), 500


@invoices_bp.route('/api/customer/invoices/<int:invoice_id>', methods=['DELETE'])
@login_required
def customer_delete_invoice(invoice_id):
    """Hide an invoice from customer view by cancelling it (soft delete)."""
    try:
        customer_id = g.auth_payload.get('customer_id')

        invoice = get_invoice_by_id(invoice_id, customer_id)
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404

        success = update_invoice_status(invoice_id, 'cancelled')
        if not success:
            return jsonify({'error': 'Failed to delete invoice'}), 500

        return jsonify({
            'success': True,
            'message': 'Invoice removed from your list.',
            'invoice_id': invoice_id,
        }), 200

    except Exception as e:
        return jsonify({'error': 'Failed to delete invoice: ' + str(e)}), 500
