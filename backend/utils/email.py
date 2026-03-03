from flask import current_app

try:
    from flask_mail import Message
except Exception:  # optional dependency in some local envs
    Message = None

def send_email(to, subject, html_body):
    if Message is None:
        current_app.logger.warning('Flask-Mail not installed; skipping email send to %s', to)
        return
    mail = current_app.extensions.get('mail')
    if not mail:
        current_app.logger.warning('Flask-Mail not configured; skipping email send to %s', to)
        return
    msg = Message(subject, recipients=[to], html=html_body)
    mail.send(msg)

def work_order_confirmation_email(work_order, customer_email):
    project_name = getattr(work_order, 'project_name', None) or getattr(getattr(work_order, 'project', None), 'name', 'Your Design')
    submitted_at = getattr(work_order, 'submitted_at', None) or getattr(work_order, 'created_at', None)
    submitted_text = submitted_at.strftime('%Y-%m-%d %H:%M') if submitted_at else 'N/A'
    return f"""
    <html>
    <body>
        <h2>Thank you for your Work Order Submission!</h2>
        <p>Dear {customer_email},</p>
        <p>Your work order <b>{work_order.work_order_number}</b> has been received and is now <b>{work_order.status}</b>.</p>
        <p>Project: <b>{project_name}</b></p>
        <p>Submitted: {submitted_text}</p>
        <hr>
        <p>We will review your design and contact you soon.</p>
        <p>Thank you,<br>SGCG Art Glass Team</p>
    </body>
    </html>
    """

def work_order_notification_email(work_order, admin_email):
    project_name = getattr(work_order, 'project_name', None) or getattr(getattr(work_order, 'project', None), 'name', 'Your Design')
    submitted_at = getattr(work_order, 'submitted_at', None) or getattr(work_order, 'created_at', None)
    submitted_text = submitted_at.strftime('%Y-%m-%d %H:%M') if submitted_at else 'N/A'
    return f"""
    <html>
    <body>
        <h2>New Work Order Submitted</h2>
        <p>Work Order: <b>{work_order.work_order_number}</b></p>
        <p>Customer: {work_order.user_id}</p>
        <p>Project: <b>{project_name}</b></p>
        <p>Submitted: {submitted_text}</p>
        <hr>
        <p><a href='https://your-admin-url.com/admin/work-orders/{work_order.id}'>View in Admin Panel</a></p>
    </body>
    </html>
    """
