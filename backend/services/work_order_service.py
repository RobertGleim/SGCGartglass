from datetime import datetime
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from backend.models import WorkOrder, WorkOrderStatusHistory, UserProject
from backend.utils.email import send_email, work_order_confirmation_email, work_order_notification_email

STATUS_WORKFLOW = [
    'Pending Review', 'Under Review', 'Quote Sent', 'Approved', 'In Production', 'Completed', 'Cancelled'
]


def generate_work_order_number(db: Session):
    year = datetime.utcnow().year
    prefix = f'WO-{year}-'
    max_num = db.query(WorkOrder).filter(WorkOrder.work_order_number.like(f'{prefix}%')).count() + 1
    return f'{prefix}{max_num:04d}'

def validate_design_completion(design_data, template):
    try:
        regions = design_data.get('regions', [])
        total = len(template.get('regions', []))
        filled = sum(1 for r in regions if r.get('color'))
        percent = int((filled / total) * 100) if total > 0 else 0
        return percent >= 50, percent
    except Exception:
        return False, 0

def submit_work_order(user_id, project_id, form_data, db: Session, template):
    # Validate design completion
    design_data = form_data.get('design_data')
    ok, percent = validate_design_completion(design_data, template)
    if not ok:
        return None, f'Design must be at least 50% complete (currently {percent}%)'
    now = datetime.utcnow()
    try:
        work_order_number = generate_work_order_number(db)
        work_order = WorkOrder(
            work_order_number=work_order_number,
            user_id=user_id,
            project_id=project_id,
            template_id=form_data.get('template_id'),
            project_name=form_data.get('project_name'),
            project_notes=form_data.get('project_notes'),
            preferred_timeline=form_data.get('preferred_timeline'),
            budget_range=form_data.get('budget_range'),
            contact_preference=form_data.get('contact_preference'),
            design_data=design_data,
            preview_image_path=form_data.get('preview_image_path'),
            status='Pending Review',
            admin_notes=None,
            submitted_at=now,
            updated_at=now
        )
        db.add(work_order)
        db.commit()
        db.refresh(work_order)
        # Create status history
        history = WorkOrderStatusHistory(
            work_order_id=work_order.id,
            old_status=None,
            new_status='Pending Review',
            changed_by=user_id,
            notes='Submitted',
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
        work_order.updated_at = datetime.utcnow()
        db.commit()
        # Add status history
        history = WorkOrderStatusHistory(
            work_order_id=work_order_id,
            old_status=old_status,
            new_status=new_status,
            changed_by=admin_id,
            notes=notes,
            changed_at=datetime.utcnow()
        )
        db.add(history)
        db.commit()
        return work_order, None
    except SQLAlchemyError as e:
        db.rollback()
        return None, str(e)
