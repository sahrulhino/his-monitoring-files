# HIS File Engine

Aplikasi web 2 panel ala FileZilla:

- Kiri: file manager untuk folder server (default `/var/www`)
- Kanan: koneksi ke server IDS (SFTP/FTP)
- Fitur: list folder/file, upload, download, edit, buat file/folder, rename, delete, transfer kiri↔kanan

## Prasyarat

- Node.js 18+ (disarankan)
- Akses filesystem untuk `LOCAL_ROOT` (mis. `/var/www`)
- Akses jaringan ke `IDS_HOST` (SFTP/FTP)

## Instalasi

```bash
npm install
```

## Konfigurasi ENV

Contoh `.env`:

```bash
APP_PORT=8099
APP_BASE_PATH=/fileengine
APP_LOGIN_USERNAME=admin
APP_LOGIN_PASSWORD=strong_password
APP_SESSION_SECRET=isi_dengan_random_hex_panjang
APP_COOKIE_SECURE=true

LOCAL_ROOT=/var/www
LOCAL_DEFAULT_PATH=/

IDS_PROTOCOL=sftp
IDS_HOST=10.17.51.22
IDS_PORT=22
IDS_USERNAME=DAUSER
IDS_PASSWORD=dauser
IDS_DEFAULT_PATH=/
```

Daftar ENV:

- `APP_PORT`: port aplikasi (default `8099`)
- `APP_BASE_PATH`: base path saat di-proxy Nginx (default `/`)
- `APP_LOGIN_USERNAME`, `APP_LOGIN_PASSWORD`: kredensial login aplikasi
- `APP_SESSION_SECRET`: secret untuk signing cookie session (wajib, jangan kosong)
- `APP_COOKIE_SECURE`: set `true` jika akses via HTTPS (mis. behind Cloudflare/Nginx)
- `APP_SESSION_TTL_MS`: TTL session (default 12 jam)
- `APP_UPLOAD_MAX_BYTES`: limit upload (default 200MB)
- `LOCAL_ROOT`: root folder panel kiri (default `/var/www`)
- `LOCAL_DEFAULT_PATH`: path awal panel kiri (default `/`)
- `IDS_PROTOCOL`: `sftp` (default) atau `ftp`
- `IDS_HOST`: host IDS
- `IDS_PORT`: port IDS (opsional; default 22 untuk sftp, 21 untuk ftp)
- `IDS_USERNAME`, `IDS_PASSWORD`: kredensial IDS
- `IDS_DEFAULT_PATH`: path awal panel kanan (default `/`)

Generate `APP_SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Menjalankan

```bash
npm start
```

Aplikasi jalan di:

- `http://127.0.0.1:APP_PORT/APP_BASE_PATH`

Contoh:

- `http://127.0.0.1:8099/fileengine`

## Setup Nginx (contoh)

Jika domain sudah di-handle Nginx dan ingin expose di path `/fileengine/`:

```nginx
location /fileengine/ {
  proxy_pass http://127.0.0.1:8099/fileengine/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_read_timeout 5000s;
}
```

Jika Anda pakai base path lain, samakan `APP_BASE_PATH` dengan location.

