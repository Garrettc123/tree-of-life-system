"""OAuth2 Provider Integration - Google, GitHub, Microsoft"""
import os
from typing import Dict, Optional
import httpx
from fastapi import HTTPException
import jwt
from datetime import datetime, timedelta

class OAuth2Provider:
    """Base OAuth2 provider class"""
    
    def __init__(self, client_id: str, client_secret: str, redirect_uri: str):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
    
    async def get_authorization_url(self) -> str:
        raise NotImplementedError
    
    async def exchange_code_for_token(self, code: str) -> Dict:
        raise NotImplementedError
    
    async def get_user_info(self, access_token: str) -> Dict:
        raise NotImplementedError

class GoogleOAuth2(OAuth2Provider):
    """Google OAuth2 implementation"""
    
    AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
    TOKEN_URL = "https://oauth2.googleapis.com/token"
    USER_INFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
    
    async def get_authorization_url(self) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "access_type": "offline",
            "prompt": "consent"
        }
        query = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{self.AUTH_URL}?{query}"
    
    async def exchange_code_for_token(self, code: str) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(self.TOKEN_URL, data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": self.redirect_uri,
                "grant_type": "authorization_code"
            })
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Token exchange failed")
            return response.json()
    
    async def get_user_info(self, access_token: str) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.USER_INFO_URL,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to get user info")
            return response.json()

class GitHubOAuth2(OAuth2Provider):
    """GitHub OAuth2 implementation"""
    
    AUTH_URL = "https://github.com/login/oauth/authorize"
    TOKEN_URL = "https://github.com/login/oauth/access_token"
    USER_INFO_URL = "https://api.github.com/user"
    
    async def get_authorization_url(self) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": "user:email read:user"
        }
        query = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{self.AUTH_URL}?{query}"
    
    async def exchange_code_for_token(self, code: str) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TOKEN_URL,
                data={
                    "code": code,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "redirect_uri": self.redirect_uri
                },
                headers={"Accept": "application/json"}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Token exchange failed")
            return response.json()
    
    async def get_user_info(self, access_token: str) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.USER_INFO_URL,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to get user info")
            return response.json()

class MicrosoftOAuth2(OAuth2Provider):
    """Microsoft OAuth2 implementation"""
    
    AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
    TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    USER_INFO_URL = "https://graph.microsoft.com/v1.0/me"
    
    async def get_authorization_url(self) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile User.Read",
            "response_mode": "query"
        }
        query = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{self.AUTH_URL}?{query}"
    
    async def exchange_code_for_token(self, code: str) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.post(self.TOKEN_URL, data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": self.redirect_uri,
                "grant_type": "authorization_code"
            })
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Token exchange failed")
            return response.json()
    
    async def get_user_info(self, access_token: str) -> Dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                self.USER_INFO_URL,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to get user info")
            return response.json()

# Provider factory
def get_oauth_provider(provider: str) -> OAuth2Provider:
    """Get OAuth2 provider by name"""
    providers = {
        "google": GoogleOAuth2(
            client_id=os.getenv("GOOGLE_CLIENT_ID"),
            client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
            redirect_uri=os.getenv("GOOGLE_REDIRECT_URI")
        ),
        "github": GitHubOAuth2(
            client_id=os.getenv("GITHUB_CLIENT_ID"),
            client_secret=os.getenv("GITHUB_CLIENT_SECRET"),
            redirect_uri=os.getenv("GITHUB_REDIRECT_URI")
        ),
        "microsoft": MicrosoftOAuth2(
            client_id=os.getenv("MICROSOFT_CLIENT_ID"),
            client_secret=os.getenv("MICROSOFT_CLIENT_SECRET"),
            redirect_uri=os.getenv("MICROSOFT_REDIRECT_URI")
        )
    }
    
    if provider not in providers:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    
    return providers[provider]
