from datetime import datetime
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.models import WorkOrder, WorkOrderStatusHistory, UserProject
from backend.utils.email import send_email, work_order_confirmation_email, work_order_notification_email

STATUS_WORKFLOW = [
    'Pending Review', 'Under Review', 'Revision Requested', 'Revision Submitted',
    'Quote Sent', 'Approved', 'In Production', 'Completed', 'Cancelled'
]


def generate_work_order_number(db: Session):
    from sqlalchemy import func
    year = datetime.utcnow().year
    prefix = f'WO-{year}-'
    # Use MAX on the string (zero-padded, so lexicographic order == numeric order)
    # instead of COUNT which breaks if rows are deleted
    max_wo = db.query(func.max(WorkOrder.work_order_number)).filter(
        WorkOrder.work_order_number.like(f'{prefix}%')
    ).scalar()
    if max_wo:
        max_num = int(max_wo.split('-')[-1])
    else:
        max_num = 0
    return f'{prefix}{max_num + 1:04d}'

def generate_custom_work_order_number(db: Session):
    """Generate custom work order number in format CWO-YYYY-#### (e.g., CWO-2026-0001)"""
    from sqlalchemy import func
    year = datetime.utcnow().year
    prefix = f'CWO-{year}-'
    # Use MAX on the string (zero-padded, so lexicographic order == numeric order)
    # instead of COUNT which breaks if rows are deleted
    max_wo = db.query(func.max(WorkOrder.work_order_number)).filter(
        WorkOrder.work_order_number.like(f'{prefix}%')
    ).scalar()
    if max_wo:
        max_num = int(max_wo.split('-')[-1])
    else:
        max_num = 0
    return f'{prefix}{max_num + 1:04d}'

def validate_design_completion(design_data, template):
    # Skip validation if no template provided (allow direct submissions)
    if not template or not template.get('regions'):
        return True, 100
    try:
        regions = design_data.get('regions', []) if design_data else []
        total = len(template.get('regions', []))
        filled = sum(1 for r in regions if r.get('color'))
        percent = int((filled / total) * 100) if total > 0 else 100
        return percent >= 50, percent
    except Exception:
        return True, 100  # Allow submission on validation error

def submit_work_order(user_id, project_id, form_data, db: Session, template):
    # Validate design completion (skipped if no template)
    design_data = form_data.get('design_data')
    ok, percent = validate_design_completion(design_data, template)
    if not ok:
        return None, f'Design must be at least 50% complete (currently {percent}%)'
    now = datetime.utcnow()
    try:
        work_order_number = generate_work_order_number(db)
        # Combine all customer input into customer_notes
        notes_parts = []
        if form_data.get('project_name'):
            notes_parts.append(f"Project: {form_data.get('project_name')}")
        if form_data.get('project_notes'):
            notes_parts.append(f"Notes: {form_data.get('project_notes')}")
        if form_data.get('preferred_timeline'):
            notes_parts.append(f"Timeline: {form_data.get('preferred_timeline')}")
        if form_data.get('budget_range'):
            notes_parts.append(f"Budget: {form_data.get('budget_range')}")
        if form_data.get('contact_preference'):
            notes_parts.append(f"Contact: {form_data.get('contact_preference')}")
        customer_notes = "\n".join(notes_parts) if notes_parts else None
        
        work_order = WorkOrder(
            work_order_number=work_order_number,
            user_id=user_id,
            project_id=project_id,
            customer_notes=customer_notes,
            status='Pending Review',
        )
        db.add(work_order)
        db.commit()
        db.refresh(work_order)
        # Create status history
        history = WorkOrderStatusHistory(
            work_order_id=work_order.id,
            from_status=None,
            to_status='Pending Review',
            changed_by=user_id,
            changed_at=now
        )
        db.add(history)
        db.commit()
        return work_order, None
    except SQLAlchemyError as e:
        db.rollback()
        return None, str(e)

def send_work_order_emails(work_order, customer_email, admin_email):
    try:
        send_email(customer_email, f'Work Order Confirmation: {work_order.work_order_number}', work_order_confirmation_email(work_order, customer_email))
        send_email(admin_email, f'New Work Order: {work_order.work_order_number}', work_order_notification_email(work_order, admin_email))
        return True, None
    except Exception as e:
        return False, str(e)

def update_work_order_status(work_order_id, new_status, admin_id, notes, db: Session):
    try:
        work_order = db.query(WorkOrder).filter_by(id=work_order_id).first()
        if not work_order:
            return None, 'Work order not found.'
        if new_status not in STATUS_WORKFLOW:
            return None, 'Invalid status.'
        old_status = work_order.status
        work_order.status = new_status
        work_order.admin_notes = notes
        db.commit()
        # Add status history
        history = WorkOrderStatusHistory(
            work_order_id=work_order_id,
            from_status=old_status if isinstance(old_status, str) else str(old_status),
            to_status=new_status,
            changed_by=admin_id,
            changed_at=datetime.utcnow()
        )
        db.add(history)
        db.commit()
        return work_order, None
    except SQLAlchemyError as e:
        db.rollback()
        return None, str(e)
