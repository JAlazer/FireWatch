import os
from clerk_backend_api import Clerk
from clerk_backend_api.jwks_helpers import AuthenticateRequestOptions
from fastapi import Request, HTTPException

clerk = Clerk(bearer_auth=os.environ["CLERK_SECRET_KEY"])

def verify_clerk_session(request: Request) -> str:
    request_state = clerk.authenticate_request(
        request,
        AuthenticateRequestOptions(),
    )
    if not request_state.is_signed_in:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return request_state.payload["sub"]