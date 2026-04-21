import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.daily_report_log import DailyReportLog

logger = logging.getLogger(__name__)


def _build_html(report: dict) -> str:
    date = report["date"]
    total = report["total_amount"]
    count = report["total_sales_count"]
    top = report["top_products"]
    payments = report["payment_breakdown"]
    low_stock = report["low_stock_products"]

    if count == 0:
        return f"""
        <html>
        <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fafafa;">
            <div style="background: #fff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                <h1 style="color: #d4845a; text-align: center; margin: 0 0 5px;">🍪 Sweet Home</h1>
                <p style="text-align: center; color: #888; margin: 0 0 25px;">Resumen del día</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="text-align: center; font-size: 18px; color: #666;">
                    📅 <strong>{date}</strong>
                </p>
                <p style="text-align: center; font-size: 16px; color: #999; padding: 30px 0;">
                    No se registraron ventas este día.
                </p>
            </div>
            <p style="text-align: center; color: #aaa; font-size: 12px; margin-top: 20px;">
                Generado automáticamente por Sweet Home POS
            </p>
        </body>
        </html>
        """

    # Top products rows
    top_rows = ""
    for i, p in enumerate(top, 1):
        top_rows += f"""
        <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0;">{i}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0;">{p['name']}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">{p['quantity']}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: right;">${p['revenue']:,.2f}</td>
        </tr>
        """

    # Payment rows
    payment_rows = ""
    for p in payments:
        label = "💵 Efectivo" if p["method"] == "efectivo" else "📱 Transferencia"
        payment_rows += f"""
        <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0;">{label}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">{p['count']}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: right;">${p['total']:,.2f}</td>
        </tr>
        """

    # Low stock rows
    low_stock_section = ""
    if low_stock:
        stock_rows = ""
        for item in low_stock:
            color = "#e74c3c" if item["stock"] == 0 else "#f39c12"
            stock_rows += f"""
            <tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0;">{item['name']}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f0f0f0; text-align: center;">
                    <span style="color: {color}; font-weight: bold;">{item['stock']}</span>
                </td>
            </tr>
            """
        low_stock_section = f"""
        <h3 style="color: #e74c3c; margin: 25px 0 10px;">⚠️ Inventario Bajo</h3>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #fff5f5;">
                    <th style="padding: 8px 12px; text-align: left; color: #e74c3c;">Producto</th>
                    <th style="padding: 8px 12px; text-align: center; color: #e74c3c;">Stock</th>
                </tr>
            </thead>
            <tbody>{stock_rows}</tbody>
        </table>
        """

    return f"""
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fafafa;">
        <div style="background: #fff; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            <h1 style="color: #d4845a; text-align: center; margin: 0 0 5px;">🍪 Sweet Home</h1>
            <p style="text-align: center; color: #888; margin: 0 0 25px;">Resumen del día</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

            <p style="text-align: center; font-size: 18px; color: #666;">📅 <strong>{date}</strong></p>

            <div style="background: linear-gradient(135deg, #d4845a, #e8a87c); border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
                <p style="color: rgba(255,255,255,0.8); margin: 0; font-size: 14px;">Total Vendido</p>
                <p style="color: #fff; margin: 5px 0 0; font-size: 36px; font-weight: bold;">${total:,.2f}</p>
                <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0; font-size: 14px;">{count} venta{'s' if count != 1 else ''}</p>
            </div>

            <h3 style="color: #333; margin: 25px 0 10px;">🏆 Productos Más Vendidos</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f4f0;">
                        <th style="padding: 8px 12px; text-align: left; color: #d4845a;">#</th>
                        <th style="padding: 8px 12px; text-align: left; color: #d4845a;">Producto</th>
                        <th style="padding: 8px 12px; text-align: center; color: #d4845a;">Cant.</th>
                        <th style="padding: 8px 12px; text-align: right; color: #d4845a;">Ingreso</th>
                    </tr>
                </thead>
                <tbody>{top_rows}</tbody>
            </table>

            <h3 style="color: #333; margin: 25px 0 10px;">💳 Desglose por Pago</h3>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f4f0;">
                        <th style="padding: 8px 12px; text-align: left; color: #d4845a;">Método</th>
                        <th style="padding: 8px 12px; text-align: center; color: #d4845a;">Ventas</th>
                        <th style="padding: 8px 12px; text-align: right; color: #d4845a;">Total</th>
                    </tr>
                </thead>
                <tbody>{payment_rows}</tbody>
            </table>

            {low_stock_section}
        </div>
        <p style="text-align: center; color: #aaa; font-size: 12px; margin-top: 20px;">
            Generado automáticamente por Sweet Home POS
        </p>
    </body>
    </html>
    """


async def send_daily_report_email(report: dict) -> bool:
    if not settings.gmail_user or not settings.gmail_app_password:
        logger.warning("Gmail credentials not configured, skipping email")
        return False

    html = _build_html(report)
    date = report["date"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🍪 Sweet Home - Resumen del {date}"
    msg["From"] = settings.gmail_user
    msg["To"] = settings.email_recipient
    msg.attach(MIMEText(html, "html"))

    for attempt in range(3):
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(settings.gmail_user, settings.gmail_app_password)
                server.sendmail(
                    settings.gmail_user, settings.email_recipient, msg.as_string()
                )
            logger.info(f"Daily report email sent for {date}")
            return True
        except Exception as e:
            logger.error(f"Email attempt {attempt + 1} failed: {e}")

    return False


async def send_daily_report_once(db: AsyncSession) -> dict:
    """Send today's daily report email exactly once per calendar day.

    Idempotent: if a row already exists in daily_report_log for today's Mexico-TZ
    date, returns skipped=True without re-sending. The log row is only written
    after a successful send, so transient email failures will retry on the next
    trigger.
    """
    from app.services.report_service import generate_daily_report

    report = await generate_daily_report(db)
    report_date = report["date"]

    existing = await db.execute(
        select(DailyReportLog).where(DailyReportLog.report_date == report_date)
    )
    if existing.scalars().first():
        logger.info(f"Daily report for {report_date} already sent; skipping")
        return {"sent": False, "skipped": True, "date": report_date}

    success = await send_daily_report_email(report)
    if success:
        db.add(DailyReportLog(report_date=report_date))
        await db.commit()

    return {"sent": success, "skipped": False, "date": report_date}
