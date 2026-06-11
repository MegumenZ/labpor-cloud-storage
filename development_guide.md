# Panduan Pengembangan Lokal (Development Guide) - Labpro Storage

Dokumen ini ditujukan bagi developer (anggota Labpro atau Anda sendiri) yang ingin menjalankan, memodifikasi, atau mengembangkan aplikasi **Labpro Storage** di lingkungan lokal (*development/localhost*).

---

## 1. Persyaratan Sistem & Dependensi
Sebelum memulai, pastikan perangkat lokal Anda sudah terpasang:
* **Runtime**: [Bun](https://bun.sh/) (Disarankan untuk backend karena performa tinggi dan kompatibilitas penuh dengan ElysiaJS. Namun, Node.js + npm/yarn juga bisa digunakan jika diperlukan).
* **Database**: PostgreSQL (Berjalan secara lokal atau via Docker).
* **Object Storage**: Kluster Ceph S3 aktif (atau MinIO lokal sebagai alternatif pengganti S3 untuk pengujian offline).
* **Git**: Untuk manajemen versi kode.

---

## 2. Struktur Proyek
Repositori ini terbagi menjadi dua modul utama:
* `/cloud-backend` (Backend API): Dibangun menggunakan ElysiaJS (Bun framework) dan Drizzle ORM.
* `/cloud-frontend` (Frontend Web): Portal antarmuka pengguna berbasis React, Vite, dan Tailwind CSS.

---

## 3. Langkah Setup & Pengembangan Lokal

### 3.1. Setup Database PostgreSQL Lokal
1. Buat database baru bernama `skripsi_cloud` (atau nama lain bebas) di PostgreSQL lokal Anda.
2. Pastikan credentials (username, password, port) sudah Anda miliki untuk diisi ke berkas konfigurasi `.env`.

### 3.2. Pengembangan Modul Backend (`cloud-backend`)
1. **Masuk ke direktori backend**:
   ```bash
   cd cloud-backend
   ```
2. **Pasang dependensi**:
   ```bash
   bun install
   ```
3. **Konfigurasi Environment Variables (`.env`)**:
   Salin berkas `.env.example` menjadi `.env` di dalam folder `cloud-backend/`:
   ```bash
   cp .env.example .env
   ```
   Buka berkas `.env` dan sesuaikan nilainya:
   * `DATABASE_URL`: Isi dengan URL PostgreSQL lokal Anda (contoh: `postgres://postgres:sandi123@localhost:5432/skripsi_cloud`).
   * `S3_ENDPOINT`: Arahkan ke endpoint Ceph RGW (atau `http://localhost:9000` jika menggunakan MinIO lokal).
   * Kredensial S3 (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`): Sesuai dengan bucket S3 Anda.

4. **Sinkronisasi Schema Database (Drizzle ORM)**:
   Gunakan perintah Drizzle Kit untuk membuat tabel secara otomatis di database lokal sesuai schema yang didefinisikan pada kode:
   ```bash
   bun run db:push
   ```
   *(Opsional: Jalankan `bun run db:studio` jika Anda ingin membuka GUI browser bawaan Drizzle untuk mengedit data secara visual).*

5. **Jalankan Server Backend Lokal**:
   ```bash
   bun run dev
   ```
   Server backend akan berjalan di `http://localhost:3001`.

6. **Skrip Pembersihan Database Lokal (Jika Diperlukan)**:
   Jika Anda ingin mengosongkan riwayat rekaman berkas di tabel database tanpa menghapus akun pengguna (untuk sinkronisasi ulang dengan S3), jalankan:
   ```bash
   bun run db:reset-files
   ```

---

### 3.3. Pengembangan Modul Frontend (`cloud-frontend`)
1. **Masuk ke direktori frontend**:
   ```bash
   cd cloud-frontend
   ```
2. **Pasang dependensi**:
   ```bash
   npm install
   # atau menggunakan bun:
   bun install
   ```
3. **Jalankan Server Frontend Lokal**:
   ```bash
   npm run dev
   ```
   Aplikasi frontend akan berjalan di `http://localhost:5173`. 
   
   *Secara default, Vite akan mengarahkan kueri API ke backend localhost port 3001. Jika Anda ingin menghubungkan frontend lokal ke backend yang berjalan di VM, buat file `.env` di root `cloud-frontend` dan isi:*
   ```properties
   VITE_API_BASE_URL=https://100.68.13.84
   ```

---

## 4. Alur Kerja Modifikasi Kode & Schema

### 4.1. Menambah / Mengubah Struktur Tabel (Database Schema)
1. Modifikasi file schema Drizzle di **`cloud-backend/src/db.ts`** (misalnya menambah kolom baru, mengubah tipe data, atau menambah indeks).
2. Setelah file schema disimpan, jalankan perintah sinkronisasi di terminal backend:
   ```bash
   bun run db:push
   ```
3. Drizzle akan mendeteksi perbedaan schema dan langsung menerapkannya pada database PostgreSQL lokal tanpa membuat file migrasi mentah (sangat cocok untuk tahap pengembangan cepat).

### 4.2. Mengubah Koneksi S3/Ceph
* Logika inisialisasi S3 Client berada di **`cloud-backend/src/files/s3.ts`**.
* Jika Anda ingin memodifikasi batas waktu masa berlaku URL Presigned (untuk preview/download), Anda dapat mengubah parameter di file handler berkas terkait di dalam direktori `cloud-backend/src/files/`.

---

## 5. Menjalankan Centralized Logging secara Lokal (Opsional)
Jika Anda sedang mengembangkan atau menguji fitur Fluent Bit dan OpenSearch di komputer lokal:
1. Jalankan OpenSearch dan Dashboards lokal menggunakan Docker Compose:
   ```bash
   cd cloud-backend
   docker-compose -f docker-compose-opensearch.yml up -d
   ```
2. Pastikan Fluent Bit lokal terpasang di PC Anda, lalu jalankan log shipper lokal untuk memantau log aplikasi:
   ```bash
   # Contoh perintah di Windows (jalankan PowerShell di dalam cloud-backend)
   & "C:\Program Files\fluent-bit\bin\fluent-bit.exe" -c fluent-bit-app.conf
   ```
3. Buka browser ke `http://localhost:5601` untuk melihat visualisasi log di OpenSearch Dashboards lokal (kredensial default: `admin` / `LabproCephLogging2026!`).

---

## 6. Tips & Masalah Pengembangan Lokal (Troubleshooting)

### 6.1. Terkena Blokir Rate Limit Saat Pengujian
* **Masalah**: Anda menerima respons `429 Too Many Requests` saat mencoba login, register, atau mengirim request bertubi-tubi di PC lokal.
* **Penyebab**: Aplikasi menggunakan middleware pembatas laju request (*Rate Limiter*) berbasis tabel database untuk keamanan.
* **Solusi**: Anda dapat mengosongkan pembatas tersebut dengan mengosongkan tabel `rate_limits` langsung dari database PostgreSQL lokal:
  ```sql
  TRUNCATE TABLE rate_limits;
  ```

### 6.2. Masalah CORS (Cross-Origin Resource Sharing)
* **Masalah**: Frontend gagal memanggil API backend dengan error CORS pada konsol browser.
* **Penyebab**: Domain/port frontend lokal Anda belum terdaftar di daftar asal yang diizinkan (*Allowed Origins*).
* **Solusi**: Pastikan variabel `ALLOWED_ORIGINS` di berkas `.env` backend mengarah ke URL frontend lokal Anda (default: `http://localhost:5173`). Jika port frontend berubah, sesuaikan nilai variabel tersebut di `.env` dan restart server backend Bun.

### 6.3. Sinkronisasi Ulang Database & S3 Bucket
* **Masalah**: Data di database lokal tidak sinkron dengan isi berkas di penyimpanan S3 lokal (MinIO/Ceph).
* **Solusi**: Gunakan skrip pembersih yang telah disediakan untuk mereset seluruh record data file di database ke kondisi kosong agar Anda bisa mengunggah ulang dari awal:
  ```bash
  bun run db:reset-files
  ```

---

## 7. Panduan Deployment Ke VM Dari Terminal Lokal

Untuk mempublikasikan perubahan kode terbaru dari komputer pengembangan lokal ke VM Server (`100.68.13.84`), jalankan langkah-langkah berikut dari terminal laptop Anda:

### 7.1. Build & Deploy Frontend (React)
1. **Set Base URL API & Build**:
   Di PowerShell komputer lokal Anda (pastikan berada di dalam folder `cloud-frontend`), jalankan perintah berikut untuk mengompilasi kode frontend dengan base URL yang mengarah ke VM:
   ```powershell
   $env:VITE_API_BASE_URL="https://100.68.13.84"
   npm run build
   ```
2. **Kirim Folder Build ke VM**:
   Setelah proses kompilasi selesai, jalankan perintah SCP berikut untuk mengganti folder build lama di VM dengan folder `dist` terbaru:
   ```powershell
   # Pindah ke root direktori proyek (D:\TesTugas\cloud)
   cd ..
   
   # Hapus folder dist lama di VM
   ssh root@100.68.13.84 "rm -rf /var/www/labpro-storage/dist"
   
   # Kirim folder dist baru
   scp -r cloud-frontend/dist/ root@100.68.13.84:/var/www/labpro-storage/
   ```

### 7.2. Deploy Backend (ElysiaJS)
1. **Kirim Berkas Backend ke VM**:
   Jika Anda mengubah logika rute backend (misalnya file `files/index.ts`), jalankan perintah ini di PowerShell lokal Anda:
   ```powershell
   scp cloud-backend/src/files/index.ts root@100.68.13.84:/root/cloud-backend/src/files/index.ts
   ```
2. **Muat Ulang Layanan di VM**:
   Jalankan perintah restart layanan backend secara remote lewat terminal lokal Anda:
   ```powershell
   ssh root@100.68.13.84 "systemctl restart cloud-backend"
   ```


