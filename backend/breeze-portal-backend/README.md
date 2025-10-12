# Breeze Portal Backend (Starter)

Minimal Express + SQLite backend for a company portal:
- Auth (register/login) with JWT
- Users (get/update profile)
- Feed (posts + likes) with realtime updates via Socket.IO
- 1:1 Chat with presence and realtime messages

## Quick start
1. Install Node.js 18+
2. `npm install`
3. Copy `.env.example` to `.env` and set `JWT_SECRET`
4. `npm run dev`

## Endpoints
- POST /api/auth/register { name, email, password }
- POST /api/auth/login { email, password }
- GET  /api/users/me (Bearer token)
- PUT  /api/users/me { name?, position?, department?, phone?, avatar_url? }
- GET  /api/posts
- POST /api/posts { content }
- POST /api/posts/:id/like
- GET  /api/messages/:otherUserId

## Socket.IO events
- client -> server: `auth` (token)
- server -> all:   `presence:update` [userIds]
- client -> server: `chat:send` { toUserId, text }
- server -> client: `chat:message` { id, sender_id, recipient_id, text, created_at }
- server -> all:   `feed:new_post` post
- server -> all:   `feed:like_updated` { postId, likes }

## Notes
- Database file is `breeze.db` in the project root.
- This is intentionally small and readable so you can extend it.
