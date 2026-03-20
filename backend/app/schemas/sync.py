from pydantic import BaseModel

from app.schemas.product import ProductResponse
from app.schemas.sale import SaleCreate


class SyncRequest(BaseModel):
    sales: list[SaleCreate]


class SyncResponse(BaseModel):
    synced_uuids: list[str]
    products: list[ProductResponse]
