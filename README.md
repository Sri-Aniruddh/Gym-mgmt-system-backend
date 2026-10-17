# Gym Management System - Backend API

Production-ready MERN Gym Management System REST API built with Node.js, Express, MongoDB Atlas, Nodemailer (Gmail SMTP), JWT authentication, and Cloudinary.

---

## 1. Technology & Features

- **Runtime**: Node.js (ES Modules) & Express.js
- **Database**: MongoDB Atlas with Mongoose ODM
- **Authentication**: JWT (Access Tokens + secure HTTP-only Refresh Cookies)
- **Password Security**: bcryptjs password hashing
- **Email Delivery**: **Nodemailer with Gmail SMTP** (`smtp.gmail.com:465`, SSL/TLS)
- **Member Onboarding**: Secure temporary 24-hour invitation tokens, password self-setup, and automatic token invalidation
- **File Storage**: Cloudinary for member profile images
- **Security**: Helmet, CORS origin allowlists, Rate Limiting, Audit logs

---

## 2. Gmail SMTP Setup (Nodemailer)

To send live member invitation emails, receipt notifications, and password reset links to members' actual email addresses, you must configure a Gmail App Password:

### Step 1: Enable 2-Step Verification on Your Google Account
1. Open your [Google Account](https://myaccount.google.com/).
2. In the navigation panel on the left, click **Security**.
3. Under "How you sign in to Google", select **2-Step Verification** and turn it ON if not already enabled.

### Step 2: Generate an App Password
1. In the search bar at the top of your Google Account page, search for **App passwords**.
2. Alternatively, go to: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Enter an app name (e.g. `Gym Management Backend`) and click **Create**.
4. Google will generate a **16-character password** (e.g., `abcd efgh ijkl mnop`).
5. Copy this 16-character code (you can paste it with or without spaces).

### Step 3: Configure Environment Variables in `backend/.env`
Add your Gmail credentials to `backend/.env`:

```env
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
EMAIL_FROM="Ashi Fitness Gym" <your_email@gmail.com>
FRONTEND_URL=http://localhost:5173
```

> **Security Note:** Never commit `backend/.env` to GitHub. It is included in `.gitignore`. For production deployments (e.g. Render), add these variables in the Render Dashboard under **Environment Variables**.

---

## 3. Environment Variables Reference

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Backend server port | `5000` |
| `NODE_ENV` | Environment mode (`development` / `production`) | `development` |
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `JWT_ACCESS_SECRET` | Secret key for signing access tokens | `your_secret_key` |
| `JWT_REFRESH_SECRET` | Secret key for signing refresh tokens | `your_secret_key` |
| `FRONTEND_URL` | Deployed Frontend URL (Vercel) | `https://your-app.vercel.app` |
| `ADMIN_EMAIL` | Admin account email | `admin@example.com` |
| `GMAIL_USER` | Authenticated Gmail address | `admin@gmail.com` |
| `GMAIL_APP_PASSWORD` | 16-character Google App Password | `abcdefghijklmnop` |
| `EMAIL_FROM` | Sender display name & address | `"Gym Management" <admin@gmail.com>` |
| `CLOUDINARY_CLOUD_NAME`| Cloudinary Cloud Name | `demo_cloud` |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | `123456789` |
| `CLOUDINARY_API_SECRET` | Cloudinary API Secret | `secret` |

---

## 4. Member Invitation & Password Setup Workflow

1. **Admin Registers Member**:
   - The Gym Admin fills in the member form in the Admin Portal.
   - The member record is saved in MongoDB.
   - A cryptographically secure random invitation token is generated.
   - Only a **SHA-256 hash** of the token is saved in MongoDB (`invitationTokenHash`) with a **24-hour expiration** (`invitationExpiresAt`).
   - An invitation email is sent via Gmail SMTP to the member's email address with a link:
     `${FRONTEND_URL}/setup-password?token=${invitationToken}`
   - No permanent or shared password is ever transmitted.

2. **Member Sets Password**:
   - The member clicks the activation link in their email.
   - The frontend calls `GET /api/v1/auth/verify-invitation?token=...` to validate that the token is unexpired and unused.
   - The member enters their own chosen password (minimum 8 characters).
   - The member submits the form (`POST /api/v1/auth/setup-password`).
   - The backend hashes the password with `bcryptjs`, clears the invitation token so it can **never be reused**, and marks the member status as `ACCEPTED`.

3. **Member Login**:
   - The member signs in at `${FRONTEND_URL}/login` using their email and newly created password.

---

## 5. Deployment Setup

### Render (Backend Deployment)
1. Go to your Web Service in [Render](https://dashboard.render.com).
2. Navigate to **Environment**.
3. Add the following variables:
   - `GMAIL_USER`: Your Gmail address.
   - `GMAIL_APP_PASSWORD`: The 16-character Google App Password.
   - `EMAIL_FROM`: `"Your Gym Name" <your_gmail_address@gmail.com>`
   - `FRONTEND_URL`: Your deployed Vercel frontend URL (e.g. `https://your-frontend.vercel.app`).
   - (Remove `RESEND_API_KEY` if present).

### Vercel (Frontend Deployment)
In Vercel project settings, set:
- `VITE_API_URL`: Your deployed Render backend URL + `/api/v1` (e.g. `https://your-backend.onrender.com/api/v1`).

---

## 6. Running Locally

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Start development server
npm run dev
```
