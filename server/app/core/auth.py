import httpx
from clerk_backend_api import Clerk
from clerk_backend_api.security.types import AuthenticateRequestOptions
from fastapi import Request, HTTPException

from app.core.config import get_settings

clerk = Clerk(bearer_auth=get_settings().clerk_secret_key)


def verify_clerk_session(request: Request) -> str:
    """
    Verifies the incoming request's Clerk session token and returns the
    Clerk user ID (the `sub` claim). Raises 401 if missing/invalid/expired.
    Sync on purpose — matches the sync Session used by user_repository.
    """
    httpx_request = httpx.Request(
        method=request.method,
        url=str(request.url),
        headers=request.headers.items(),
    )
    request_state = clerk.authenticate_request(
        httpx_request,
        AuthenticateRequestOptions(),  # authorized_parties omitted for now
    )
    if not request_state.is_signed_in:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return request_state.payload["sub"]