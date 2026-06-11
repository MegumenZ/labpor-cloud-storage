# Labpro Storage - Cloud Storage dengan Ceph S3

Repository ini berisi kode sumber dan panduan deployment untuk aplikasi **Labpro Storage**, sebuah platform cloud storage yang memanfaatkan **Ceph Object Storage (S3-compatible)** sebagai backend penyimpanan datanya. 

Proyek ini dirancang untuk deployment multi-node VM (Virtual Machine) dan dilengkapi dengan sistem pencatatan log terpusat (*centralized logging*) menggunakan Fluent Bit dan OpenSearch.

## Struktur Repository

* **`cloud-backend/`**: Backend API yang dibangun menggunakan Bun & ElysiaJS, serta Drizzle ORM untuk database PostgreSQL.
* **`cloud-frontend/`**: Frontend web portal berbasis React, Vite, dan Tailwind CSS.
* **`ceph_migration_guide.md`**: Catatan teknis & panduan instalasi kluster Ceph, konfigurasi S3 RGW, setup centralized logging, hingga konfigurasi web server Nginx + SSL.
* **`development_guide.md`**: Panduan langkah-demi-langkah setup lingkungan lokal (*localhost*), menjalankan backend/frontend untuk *development*, dan melakukan modifikasi skema database.

## Spesifikasi Stack
* **Runtime & Framework**: Bun & ElysiaJS
* **Database Relasional**: PostgreSQL
* **Object Storage**: Ceph Rados Gateway (S3-compatible)
* **Centralized Logging**: OpenSearch & OpenSearch Dashboards
* **Log Shipper**: Fluent Bit (Regex parser untuk log Ceph, JSON parser untuk log backend)
* **Web Server & Reverse Proxy**: Nginx dengan sertifikat SSL/TLS

---

## Panduan & Dokumentasi

Untuk detail instalasi dan pengembangan aplikasi, silakan merujuk pada berkas berikut:

* **[Panduan Lengkap Migrasi & Setup VM (ceph_migration_guide.md)](ceph_migration_guide.md)** — Berisi langkah setup kluster Ceph S3, sinkronisasi NTP, instalasi logging (OpenSearch + Fluent Bit), dan Nginx SSL di mesin virtual.
* **[Panduan Pengembangan Lokal (development_guide.md)](development_guide.md)** — Berisi tata cara setup database PostgreSQL lokal, instalasi dependensi, sinkronisasi schema database Drizzle ORM, dan menjalankan aplikasi di komputer lokal (development).
