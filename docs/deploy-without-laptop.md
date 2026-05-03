# Deploy Without Your Laptop (24/7 Public Access)

This guide publishes your app so it stays online even when your laptop is closed.

Recommended stack:

- Backend API: Render (free tier available)
- Frontend web app: Vercel (free tier available)

## 1) Publish backend on Render

1. Push this repo to GitHub.
2. Go to [https://render.com](https://render.com) and create a **Web Service**.
3. Connect your repo and set:
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start`
4. Add environment variables:
   - `NODE_ENV=production`
   - `PORT=8080` (Render may override this automatically)
   - `OPENAI_API_KEY=...` (optional, only if you want Whisper transcription)
5. Deploy. Copy your backend URL (example: `https://rehab-scribe-api.onrender.com`).

Quick health check:

`https://YOUR-BACKEND-URL/health`

You should see JSON with `ok: true`.

## 2) Publish frontend on Vercel

1. Go to [https://vercel.com](https://vercel.com) and import the same repo.
2. Configure project:
   - Root Directory: `web`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add environment variable:
   - `VITE_API_ORIGIN=https://YOUR-BACKEND-URL`
4. Deploy and copy your frontend URL.

## 3) Verify end-to-end

1. Open the frontend URL.
2. Start encounter -> verify consent -> save transcript -> generate draft.
3. Confirm requests are hitting `https://YOUR-BACKEND-URL/api/...`.

## 4) Share and QR code

Once deployed, this URL works for everyone (no same-WiFi requirement, no laptop required).

Generate a QR code (optional):

`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=YOUR-FRONTEND-URL`

## Common issues

- **Blocked request / host not allowed**:
  - This only applies to local dev/tunnels. Deployed Vercel + Render avoids that.
- **CORS errors**:
  - Ensure frontend uses `VITE_API_ORIGIN` pointing to your Render backend URL.
- **Backend sleeping on free tier**:
  - First request can be slow after inactivity; this is normal on free plans.

