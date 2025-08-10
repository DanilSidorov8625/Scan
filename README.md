# 📦 Scan – Document Scanning & Management API

**Scan** is a self-hosted Flask + Gunicorn + Docker backend for securely scanning, storing, and exporting structured form data. It’s designed for use in conjunction with a React Native frontend, with Stripe-powered billing and optional email export via Resend.

## 🚀 Features
- **REST API** built with Flask  
- **JWT Authentication** with rate-limiting  
- **Stripe Payments** for subscription & billing  
- **Form Scanning & Parsing & Sanitization**  
- **SQLite Storage** with Alembic migrations  
- **CSV/Email Export**  
- **Webhook support** (Stripe event processing)  
- **CORS control** for secure cross-origin requests  
- **Dockerized** for easy deployment  
- **Cloudflare + Nginx** ready for production  

## 🛠 Tech Stack
- **Backend Framework**: Flask (Python)  
- **WSGI Server**: Gunicorn  
- **Database**: SQLite (migratable to PostgreSQL)  
- **ORM**: SQLAlchemy + Flask-Migrate (Alembic)  
- **Authentication**: JWT (Flask-JWT-Extended)  
- **Payments**: Stripe API + Webhooks  
- **Email**: Resend API (optional)  
- **Rate Limiting**: Flask-Limiter (Redis recommended for production)  
- **Containerization**: Docker  
- **Reverse Proxy**: Nginx (with optional HTTPS via Let’s Encrypt)  
- **DNS & SSL**: Cloudflare


## 📂 Project Structure

app/
├── init.py         # App factory, config loading, DB init
├── models.py           # SQLAlchemy models
├── routes.py           # API routes
├── pages.py            # Optional static page routes
├── templates/          # HTML templates (e.g., index.html)
├── migrations/         # Alembic migration scripts
└── instance/           # SQLite DB & instance-specific files (mounted as volume)


## ⚙️ Configuration
Environment variables are stored in `.env` and loaded into the container.  
**Required:**



SECRET_KEY=your-secret
JWT_SECRET_KEY=your-jwt-secret
STRIPE_API_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
RESEND_API_KEY=optional-resend-api-key
FRONTEND_ORIGINS=https://yourfrontend.com
MAX_EXPORT_ROWS=5000
MAX_PAYLOAD_BYTES=2097152
PASSWORD_RESET_TOKEN_TTL=3600


**Note:** Never commit `.env` to Git or bake it into public Docker images.

## 🐳 Docker Deployment
**Build & push:**
```bash
docker buildx build --platform linux/amd64 -t yourdockerhub/scan:v1 .
docker push yourdockerhub/scan:v1


docker run -d \
  -p 5000:5000 \
  --env-file /path/to/.env \
  -v /path/to/instance:/app/instance \
  --name scan \
  yourdockerhub/scan:v1


## **Nginx Reverse Proxy Setup**
server {
    server_name omnaris.xyz;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    add_header Content-Security-Policy "default-src 'self'";
}

Visit the API at http://yourdomain.com:5000 or behind Nginx for HTTPS.

🔒 Production Recommendations
	•	Use PostgreSQL or MySQL for production instead of SQLite.
	•	Store DB files in Docker volumes or external storage.
	•	Serve via Nginx reverse proxy on ports 80/443 with HTTPS.
	•	Use Redis for rate-limit storage to persist across restarts.
	•	Set strong secrets in .env and rotate periodically.
	•	Keep Stripe webhooks behind a verified endpoint.
	•	Restrict CORS to known frontends only.
	•	Enable Cloudflare proxying for security and caching.

Vist my project at omnarix.xyz
