from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.product import Product
from app.models.sale import Sale, SaleItem, SalePayment
from app.models.user import User

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo


def _today_range(date_str: str | None = None):
    tz = ZoneInfo(settings.timezone)
    if date_str:
        day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=tz)
    else:
        day = datetime.now(tz)
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    end = day.replace(hour=23, minute=59, second=59, microsecond=999999)
    # Convert CST boundaries to UTC naive for DB comparison
    return (
        start.astimezone(timezone.utc).replace(tzinfo=None),
        end.astimezone(timezone.utc).replace(tzinfo=None),
    )


async def generate_daily_report(
    db: AsyncSession,
    date_str: str | None = None,
    user: User | None = None,
) -> dict:
    """Generate the daily report.

    When `user` is an employee, sales-derived sections are filtered to that
    user's own sales. Admins (or when `user` is None) see the full aggregate
    plus a per-vendor breakdown.
    """
    start, end = _today_range(date_str)

    is_employee = user is not None and user.role == "employee"
    employee_id = user.id if is_employee else None

    def _scope_sales(stmt):
        stmt = stmt.where(
            Sale.created_at >= start,
            Sale.created_at <= end,
            Sale.cancelled == False,  # noqa: E712
        )
        if is_employee:
            stmt = stmt.where(Sale.user_id == employee_id)
        return stmt

    # Total sales and count
    sales_result = await db.execute(
        _scope_sales(select(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0)))
    )
    row = sales_result.one()
    total_sales_count = row[0]
    total_amount = float(row[1])

    # Payment breakdown — grouped by individual payment rows so split payments
    # (part cash + part transfer on one sale) show up in both buckets correctly.
    # "count" is the number of payment-method hits, not unique sales.
    payment_result = await db.execute(
        _scope_sales(
            select(SalePayment.method, func.count(SalePayment.id), func.sum(SalePayment.amount))
            .join(Sale, SalePayment.sale_id == Sale.id)
        ).group_by(SalePayment.method)
    )
    payment_breakdown = [
        {"method": r[0], "count": r[1], "total": float(r[2])}
        for r in payment_result.all()
    ]

    # Total discounts given in the period
    discount_result = await db.execute(
        _scope_sales(select(func.coalesce(func.sum(Sale.discount_amount), 0)))
    )
    total_discounts = float(discount_result.scalar())

    # Top products
    top_result = await db.execute(
        _scope_sales(
            select(
                SaleItem.product_name,
                func.sum(SaleItem.quantity).label("qty"),
                func.sum(SaleItem.subtotal).label("revenue"),
            )
            .join(Sale, SaleItem.sale_id == Sale.id)
        )
        .group_by(SaleItem.product_name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(5)
    )
    top_products = [
        {"name": r[0], "quantity": int(r[1]), "revenue": float(r[2])}
        for r in top_result.all()
    ]

    # Estimated profit (only for products with cost_price set)
    profit_result = await db.execute(
        _scope_sales(
            select(
                func.coalesce(func.sum(SaleItem.subtotal), 0),
                func.coalesce(func.sum(SaleItem.quantity * Product.cost_price), 0),
            )
            .join(Sale, SaleItem.sale_id == Sale.id)
            .join(Product, SaleItem.product_id == Product.id)
        ).where(Product.cost_price.isnot(None))
    )
    profit_row = profit_result.one()
    revenue_with_cost = float(profit_row[0])
    total_cost = float(profit_row[1])
    estimated_profit = revenue_with_cost - total_cost

    # Low stock products — only admins see this; employees don't need it.
    if is_employee:
        low_stock = []
    else:
        low_stock_result = await db.execute(
            select(Product)
            .where(Product.active == True, Product.stock <= Product.low_stock_threshold)  # noqa: E712
            .order_by(Product.stock)
        )
        low_stock = [
            {"name": p.name, "stock": p.stock, "threshold": p.low_stock_threshold}
            for p in low_stock_result.scalars().all()
        ]

    # Per-vendor breakdown — only for admins (or unauthenticated callers).
    sales_by_user: list[dict] = []
    if not is_employee:
        by_user_result = await db.execute(
            select(
                Sale.user_id,
                User.username,
                func.count(Sale.id),
                func.coalesce(func.sum(Sale.total), 0),
            )
            .outerjoin(User, Sale.user_id == User.id)
            .where(
                Sale.created_at >= start,
                Sale.created_at <= end,
                Sale.cancelled == False,  # noqa: E712
            )
            .group_by(Sale.user_id, User.username)
            .order_by(func.sum(Sale.total).desc())
        )
        sales_by_user = [
            {
                "user_id": r[0],
                "username": r[1] or "(sin usuario)",
                "count": r[2],
                "total": float(r[3]),
            }
            for r in by_user_result.all()
        ]

    tz = ZoneInfo(settings.timezone)
    report_date = date_str or datetime.now(tz).strftime("%Y-%m-%d")

    return {
        "date": report_date,
        "total_sales_count": total_sales_count,
        "total_amount": total_amount,
        "estimated_profit": estimated_profit,
        "total_cost": total_cost,
        "total_discounts": total_discounts,
        "payment_breakdown": payment_breakdown,
        "top_products": top_products,
        "low_stock_products": low_stock,
        "sales_by_user": sales_by_user,
    }
