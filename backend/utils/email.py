from flask_mail import Message
from flask import current_app

def send_email(to, subject, html_body):
    mail = current_app.extensions.get('mail')
    if not mail:
        raise RuntimeError('Flask-Mail not configured')
    msg = Message(subject, recipients=[to], html=html_body)
    mail.send(msg)

def work_order_confirmation_email(work_order, customer_email):
    return f"""
    <html>
    <body>
        <h2>Thank you for your Work Order Submission!</h2>
        <p>Dear {customer_email},</p>
        <p>Your work order <b>{work_order.work_order_number}</b> has been received and is now <b>{work_order.status}</b>.</p>
        <p>Project: <b>{work_order.project_name}</b></p>
        <p>Submitted: {work_order.submitted_at.strftime('%Y-%m-%d %H:%M')}</p>
        <hr>
        <p>We will review your design and contact you soon.</p>
        <p>Thank you,<br>SGCG Art Glass Team</p>
    </body>
    </html>
    """

def work_order_notification_email(work_order, admin_email):
    return f"""
    <html>
    <body>
        <h2>New Work Order Submitted</h2>
        <p>Work Order: <b>{work_order.work_order_number}</b></p>
        <p>Customer: {work_order.user_id}</p>
        <p>Project: <b>{work_order.project_name}</b></p>
        <p>Submitted: {work_order.submitted_at.strftime('%Y-%m-%d %H:%M')}</p>
        <hr>
        <p><a href='https://your-admin-url.com/admin/work-orders/{work_order.id}'>View in Admin Panel</a></p>
    </body>
    </html>
    """
