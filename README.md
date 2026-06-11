# Labpro Storage - Cloud Storage dengan Ceph S3

Repository ini berisi kode sumber dan panduan deployment untuk aplikasi **Labpro Storage**, sebuah platform cloud storage yang memanfaatkan **Ceph Object Storage (S3-compatible)** sebagai backend penyimpanan datanya. 

Proyek ini dirancang untuk deployment multi-node VM (Virtual Machine) dan dilengkapi dengan sistem pencatatan log terpusat (*centralized logging*) menggunakan Fluent Bit dan OpenSearch.

## Struktur Repository

* **`cloud-backend/`**: Backend API yang dibangun menggunakan Bun & ElysiaJS, serta Drizzle ORM untuk database PostgreSQL.
* **`cloud-frontend/`**: Frontend web portal berbasis React, Vite, dan Tailwind CSS.
* **`ceph_migration_guide.md`**: Catatan teknis & panduan instalasi kluster Ceph, konfigurasi S3 RGW, setup centralized logging, hingga konfigurasi web server Nginx + SSL.

## Spesifikasi Stack
* **Runtime & Framework**: Bun & ElysiaJS
* **Database Relasional**: PostgreSQL
* **Object Storage**: Ceph Rados Gateway (S3-compatible)
* **Centralized Logging**: OpenSearch & OpenSearch Dashboards
* **Log Shipper**: Fluent Bit (Regex parser untuk log Ceph, JSON parser untuk log backend)
* **Web Server & Reverse Proxy**: Nginx dengan sertifikat SSL/TLS

---

## Panduan Deployment & Konfigurasi VM
Seluruh panduan langkah-demi-langkah mulai dari setup NTP Chrony, pembuatan kluster Ceph 3 node, konfigurasi Erasure Coding (k=2, m=1), hingga deployment Nginx proxy di VM dapat diakses pada dokumen terpisah berikut:

👉 **[Panduan Lengkap Migrasi & Setup VM (ceph_migration_guide.md)](ceph_migration_guide.md)**
