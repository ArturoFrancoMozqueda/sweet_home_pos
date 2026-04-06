from pydantic import BaseModel

from app.schemas.product import ProductResponse
from app.schemas.sale import SaleCreate


class SyncRequest(BaseModel):
    sales: list[SaleCreate]


class SyncFailure(BaseModel):
    uuid: str
    reason: str


class SyncResponse(BaseModel):
    synced_uuids: list[str]
    failed: list[SyncFailure] = []
    products: list[ProductResponse]
