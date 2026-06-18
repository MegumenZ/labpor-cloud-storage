# Panduan Lengkap Setup, Migrasi & Deployment Kluster Ceph S3 (Labpro Storage)

Dokumen ini merupakan panduan lengkap mengenai langkah-langkah setup, konfigurasi, migrasi, dan deployment kluster Ceph Object Storage (S3-compatible) pada arsitektur 3 Virtual Machine (VM) berbasis Ubuntu Server 22.04 LTS. Jaringan antar VM dihubungkan via Tailscale VPN untuk konektivitas yang aman dan portabel, serta dilengkapi dengan petunjuk deployment aplikasi web "Labpro Storage" (ElysiaJS + React).

---

## 1. Arsitektur & Topologi Jaringan

Arsitektur kluster ini didesain menggunakan **3 Virtual Machine (VM)** yang dihubungkan melalui jaringan virtual terenkripsi menggunakan **Tailscale VPN**. Pemilihan Tailscale bertujuan agar kluster tetap saling terhubung dengan alamat IP yang statis/tetap (`100.X.X.X`), meskipun Mini PC / komputer host berpindah-pindah router fisik (misalnya berpindah dari router rumah ke router kantor).

### 1.1. Diagram Arsitektur Deployment (Logical to Physical)
Berikut adalah visualisasi arsitektur kluster, penempatan komponen aplikasi, dan pembagian penyimpanan fisik disk OSD pada masing-masing VM:

```mermaid
graph TD
    %% Styling Akademis Formal (Hitam Putih Murni)
    classDef appBox fill:#ffffff,stroke:#000000,stroke-width:1.5px;
    classDef hostBox fill:#f5f5f5,stroke:#000000,stroke-width:1.5px;
    classDef dbBox fill:#ffffff,stroke:#000000,stroke-width:1.5px,stroke-dasharray: 5 5;

    %% Client Layer (Sisi Pengguna)
    Client["Klien (Browser Web)"]:::appBox

    %% VM 1: ceph-admin (Server Aplikasi & Utama)
    subgraph Host1 ["VM 1: ceph-admin (100.68.13.84)"]
        Nginx["Nginx Reverse Proxy (Port 443)"]:::appBox
        Backend["Aplikasi Backend (Bun/ElysiaJS - Port 3001)"]:::appBox
        DB[("Database PostgreSQL")]:::dbBox
        RGW["Ceph Object Gateway (RGW S3 - Port 8000)"]:::appBox
        OSD0["OSD 0 (Disk: /dev/sdb)"]:::hostBox
    end

    %% VM 2: ceph-node1 (Storage Node 1)
    subgraph Host2 ["VM 2: ceph-node1 (100.71.47.41)"]
        OSD1["OSD 1 (Disk: /dev/sdb)"]:::hostBox
    end

    %% VM 3: ceph-node2 (Storage Node 2)
    subgraph Host3 ["VM 3: ceph-node2 (100.75.133.14)"]
        OSD2["OSD 2 (Disk: /dev/sdb)"]:::hostBox
    end

    %% Hubungan Aliran Data & Pemetaan
    Client -->|1. HTTPS Request| Nginx
    Nginx -->|2. Forward| Backend
    Backend -->|3. Tulis Metadata| DB
    Backend -->|4. Tulis Objek via S3 API| RGW

    %% Distribusi Chunks Erasure Coding K=2, M=1
    RGW -->|5a. Simpan Chunk D1 (Lokal)| OSD0
    RGW -->|5b. Simpan Chunk D2 (via Tailscale)| OSD1
    RGW -->|5c. Simpan Chunk P1 (via Tailscale)| OSD2
```

### 1.2. Spesifikasi Node & Alokasi IP
Setiap VM dikonfigurasikan dengan **dua disk**: satu disk utama untuk OS (`/dev/sda`) dan satu disk tambahan kosong (`/dev/sdb` berkapasitas 25GB-50GB, unformatted) khusus untuk penyimpanan Ceph OSD.

1.  **ceph-admin (VM1)**:
    *   IP Lokal (Fisik): Tergantung DHCP Router (misalnya `192.168.100.65`)
    *   IP Tailscale (Statis): `100.68.13.84`
    *   Peran: Ceph Manager (MGR), Monitor (MON 0), S3 RGW Gateway, OpenSearch, Nginx Reverse Proxy, Bun Backend, PostgreSQL Database, Ceph OSD 0.
2.  **ceph-node1 (VM2)**:
    *   IP Lokal (Fisik): Tergantung DHCP Router (misalnya `192.168.100.66`)
    *   IP Tailscale (Statis): `100.71.47.41`
    *   Peran: Ceph Monitor (MON 1), Storage Node Ceph OSD 1.
3.  **ceph-node2 (VM3)**:
    *   IP Lokal (Fisik): Tergantung DHCP Router (misalnya `192.168.100.67`)
    *   IP Tailscale (Statis): `100.75.133.14`
    *   Peran: Ceph Monitor (MON 2), Storage Node Ceph OSD 2.

---

## 2. Persiapan Sistem & Jaringan (Jalankan di Semua Node)

Langkah awal ini bertujuan untuk menyamakan sistem operasi, mengonfigurasi keamanan jaringan, serta memastikan sinkronisasi waktu yang ketat antar node VM sebelum kluster dideploy.

### 2.1. Pembaruan Sistem Operasi
Perbarui seluruh repositori dan paket sistem ke versi terbaru untuk menjaga stabilitas kernel Linux:
```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2. Mengonfigurasi Password Root
Cephadm membutuhkan akses langsung sebagai user `root` melalui SSH. Buat password user root di ketiga VM:
```bash
sudo passwd root
```

### 2.3. Mengonfigurasi SSH Server (Izinkan Login Root)
Secara default, Ubuntu Server melarang login SSH menggunakan user `root`. Kita perlu mengaktifkannya:
```bash
sudo nano /etc/ssh/sshd_config
```
Cari atau tambahkan baris berikut agar bernilai `yes`:
```text
PermitRootLogin yes
```
Simpan file, uji sintaks konfigurasi, lalu restart layanan SSH:
```bash
sudo sshd -t
sudo systemctl restart ssh
```

### 2.4. Instalasi Tailscale VPN & Konfigurasi Hostname Resolution
Instal Tailscale pada ketiga VM untuk membentuk jaringan virtual pribadi yang melintasi router fisik mana pun secara transparan:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
*Catatan: Selesaikan proses login Tailscale melalui link yang muncul di terminal.*

Setelah ketiga VM terhubung, tambahkan alamat IP Tailscale masing-masing ke dalam file `/etc/hosts` di **semua VM** agar setiap node dapat saling mengenali menggunakan nama hostname-nya:
```bash
sudo nano /etc/hosts
```
Tambahkan baris berikut di bagian paling bawah file:
```text
100.68.13.84 ceph-admin
100.71.47.41 ceph-node1
100.75.133.14 ceph-node2
```

### 2.5. Sinkronisasi Waktu Menggunakan Chrony (NTP)
Ceph sangat sensitif terhadap perbedaan waktu antar node (*clock skew*). Jika perbedaan waktu antar node melebihi 0.05 detik, monitor Ceph akan mengeluarkan peringatan (*warning*) dan menghentikan sinkronisasi data. Kita akan mengonfigurasi `ceph-admin` (VM1) sebagai server waktu utama (NTP Server), sedangkan VM2 dan VM3 sebagai klien.

#### 1. Instalasi Chrony di Semua VM
```bash
sudo apt install -y chrony
```

#### 2. Konfigurasi VM1 (ceph-admin) sebagai NTP Server
Buka konfigurasi:
```bash
sudo nano /etc/chrony/chrony.conf
```
Izinkan VM2 dan VM3 melakukan sinkronisasi waktu ke VM1 melalui segmen jaringan Tailscale dengan menambahkan baris ini di akhir file:
```text
allow 100.64.0.0/10
```
Restart layanan Chrony:
```bash
sudo systemctl restart chrony
```

#### 3. Konfigurasi VM2 & VM3 sebagai NTP Klien
Buka konfigurasi pada VM2 dan VM3:
```bash
sudo nano /etc/chrony/chrony.conf
```
Hapus atau beri tanda komentar (`#`) pada baris server bawaan Ubuntu (pool.ntp.org), lalu tambahkan IP Tailscale VM1 sebagai satu-satunya rujukan waktu:
```text
server 100.68.13.84 iburst
```
Restart layanan Chrony:
```bash
sudo systemctl restart chrony
```
Uji keakuratan sinkronisasi dengan perintah berikut (pastikan terdapat tanda `*` di depan nama hostname `ceph-admin` yang menunjukkan sinkronisasi sukses):
```bash
chronyc sources
timedatectl
```

### 2.6. Instalasi Docker Engine (Semua Node)
Cephadm mendeploy seluruh layanan Ceph (seperti Monitor, Manager, RGW) di dalam kontainer terisolasi. Oleh karena itu, mesin kontainer Docker wajib diinstal di seluruh node:
```bash
sudo apt install -y docker.io
sudo systemctl enable --now docker
```

---

## 3. Pembersihan Disk Penyimpanan (Semua Node)

Sebelum disk tambahan `/dev/sdb` diserahkan kepada kluster Ceph untuk dikelola sebagai OSD, disk tersebut harus benar-benar bersih dari tabel partisi, tanda filesystem, atau data sisa instalasi sistem operasi sebelumnya.

Jalankan perintah berikut pada **ketiga VM**:
```bash
# Cek nama disk tambahan (pastikan terdeteksi sebagai /dev/sdb)
lsblk

# Hapus tabel partisi GPT/MBR secara permanen
sudo sgdisk --zap-all /dev/sdb

# Bersihkan metadata filesystem atau tanda LVM sisa
sudo wipefs --all /dev/sdb
```
*Penjelasan: Langkah pembersihan ini wajib dilakukan karena Cephadm menolak menggunakan disk yang telah memiliki partisi atau data sisa demi mencegah hilangnya data secara tidak sengaja.*

---

## 4. Konfigurasi Autentikasi SSH Keyless

Orkestrator Cephadm mengontrol, mendeploy, dan memantau daemon di semua node anggota dari VM `ceph-admin` secara remote menggunakan koneksi SSH protokol `root` tanpa password.

### 4.1. Pembuatan Kunci SSH di VM1 (ceph-admin)
Jalankan perintah ini di terminal `ceph-admin` sebagai root untuk membuat kunci RSA baru:
```bash
sudo ssh-keygen -t rsa -b 4096 -N "" -f /root/.ssh/id_rsa
```

### 4.2. Salin Kunci SSH Root ke Semua VM
Salin kunci publik yang baru dibuat ke semua VM agar `ceph-admin` dapat masuk ke VM1, VM2, dan VM3 tanpa meminta password:
```bash
sudo ssh-copy-id root@100.68.13.84
sudo ssh-copy-id root@100.71.47.41
sudo ssh-copy-id root@100.75.133.14
```
*Catatan: Anda akan diminta memasukkan password root masing-masing VM yang telah dibuat pada langkah 2.2.*

---

## 5. Inisiasi Cluster Ceph (Bootstrap di VM1)

Langkah inisiasi (*bootstrap*) akan membangun kluster Ceph minimal yang terdiri dari 1 node Monitor (MON) dan 1 node Manager (MGR) di dalam VM `ceph-admin`.

Jalankan perintah berikut di terminal `ceph-admin`:

### 5.1. Pasang cephadm CLI
Pasang repositori resmi Ceph dan instal utilitas `cephadm`:
```bash
CEPH_RELEASE=20.2.1
curl --silent --remote-name --location https://download.ceph.com/rpm-${CEPH_RELEASE}/el9/noarch/cephadm
chmod +x cephadm

sudo ./cephadm add-repo --release tentacle
sudo ./cephadm install
```

### 5.2. Bootstrap Kluster Baru
Lakukan bootstrap kluster menggunakan IP Tailscale `ceph-admin`. Kita wajib menyertakan flag `--skip-mon-network` karena subnet mask ip Tailscale bernilai `/32` yang secara default akan ditolak oleh sistem pemeriksa jaringan otomatis Ceph:
```bash
sudo cephadm bootstrap \
  --mon-ip 100.68.13.84 \
  --skip-mon-network \
  --initial-dashboard-user admin \
  --initial-dashboard-password SandiRahasiaCeph123!
```

### 5.3. Konfigurasi Jaringan Publik Ceph
Setelah proses bootstrap selesai, tentukan rentang IP jaringan yang diizinkan untuk berkomunikasi dalam kluster (gabungan IP lokal virtualbox dan subnet Tailscale):
```bash
sudo ceph config set global public_network "192.168.100.0/24,100.64.0.0/10"
```

### 5.4. Install ceph-common CLI
Instal paket perkakas CLI standar Ceph di VM agar kita bisa menjalankan perintah `ceph` secara langsung di terminal:
```bash
sudo cephadm install ceph-common
```

---

## 6. Menghubungkan Node Anggota ke Cluster

Setelah kluster aktif di VM1, kita harus mendaftarkan VM2 (`ceph-node1`) dan VM3 (`ceph-node2`) agar bergabung sebagai bagian dari kluster yang dikendalikan oleh `cephadm`.

Jalankan seluruh perintah berikut di terminal `ceph-admin`:

### 6.1. Salin SSH Key Internal Cephadm ke Node Anggota
Cephadm memiliki kunci SSH internal khusus untuk manajemen kontainer. Salin kunci publik internal tersebut ke seluruh VM agar orkestrator dapat mendeploy daemon secara remote:
```bash
sudo ceph cephadm get-pub-key > ~/ceph.pub
sudo ssh-copy-id -f -i ~/ceph.pub root@100.68.13.84
sudo ssh-copy-id -f -i ~/ceph.pub root@100.71.47.41
sudo ssh-copy-id -f -i ~/ceph.pub root@100.75.133.14
```

### 6.2. Daftarkan Host Anggota ke Orkestrator
Daftarkan `ceph-node1` dan `ceph-node2` menggunakan alamat IP Tailscale mereka:
```bash
sudo ceph orch host add ceph-node1 100.71.47.41
sudo ceph orch host add ceph-node2 100.75.133.14
```

### 6.3. Verifikasi Daftar Host
Pastikan ketiga host sudah terdaftar dan berstatus online:
```bash
sudo ceph orch host ls
```

---

## 7. Pemasangan OSD (Storage Daemon)

Setelah host terhubung, kita akan memerintahkan Ceph untuk memindai dan menggunakan disk `/dev/sdb` yang telah dibersihkan pada langkah 3 sebagai unit penyimpanan OSD secara otomatis.

Jalankan perintah ini di terminal `ceph-admin`:

### 7.1. Klaim Disk Otomatis
Perintahkan orkestrator untuk menggunakan seluruh disk kosong yang tersedia di ketiga VM sebagai OSD:
```bash
sudo ceph orch apply osd --all-available-devices
```

### 7.2. Uji Status OSD Tree
Pastikan ketiga daemon OSD (`osd.0` di VM1, `osd.1` di VM2, dan `osd.2` di VM3) telah terbuat, berstatus `up` (berjalan), dan `in` (tergabung dalam kluster):
```bash
sudo ceph osd tree
```

---

## 8. Konfigurasi Erasure Coding & Gateway S3

Untuk menghemat ruang penyimpanan pada kluster 3 VM ini, kita menggunakan metode **Erasure Coding (EC) dengan profil K=2, M=1**. Skema ini memotong objek menjadi 2 pecahan data dan 1 pecahan paritas, dengan efisiensi ruang sebesar 66.7% (jauh lebih hemat dibanding metode replikasi 3x yang memakan ruang hingga 300%).

Jalankan seluruh perintah berikut di terminal `ceph-admin`:

### 8.1. Buat Profil Erasure Coding
Buat aturan profil baru menggunakan modul *jerasure*. Setel `crush-failure-domain=host` untuk menjamin bahwa pecahan data dan paritas disebar pada host/VM yang berbeda:
```bash
sudo ceph osd erasure-code-profile set labpro-ec-profile \
  plugin=jerasure \
  k=2 \
  m=1 \
  crush-failure-domain=host \
  --force
```

### 8.2. Inisiasi RGW Realm
Realm merupakan kesatuan namespace logika tertinggi pada layanan Ceph Object Gateway:
```bash
sudo radosgw-admin realm create --rgw-realm=labpro-realm --default
```

### 8.3. Buat Zonegroup
Zonegroup mengelompokkan wilayah logis penempatan data S3:
```bash
sudo radosgw-admin zonegroup create \
  --rgw-zonegroup=labpro-zonegroup \
  --rgw-realm=labpro-realm \
  --master \
  --default
```

### 8.4. Buat Zone Penyimpanan
Zone mendefinisikan lokasi penyimpanan fisik pool bucket S3. Tentukan nama pool data dan index untuk zone ini:
```bash
sudo radosgw-admin zone create \
  --rgw-zonegroup=labpro-zonegroup \
  --rgw-zone=labpro-zone \
  --master \
  --default \
  --data-pool=labpro-zone.rgw.buckets.data \
  --index-pool=labpro-zone.rgw.buckets.index
```

### 8.5. Terapkan Perubahan Konfigurasi RGW
Terapkan perubahan realm dan zonegroup ke sistem Ceph:
```bash
sudo radosgw-admin period update --commit
```

### 8.6. Buat Pool Data Berbasis Erasure Coding & Aktifkan Fitur Overwrite
Secara default, Ceph melarang penimpaan (*overwrite*) file pada pool bertipe Erasure Coding. Karena aplikasi S3 membutuhkan fitur pengunggahan ulang/modifikasi berkas, kita wajib membuat pool menggunakan profil EC yang telah dibuat sebelumnya dan mengaktifkan fitur `allow_ec_overwrites`:
```bash
# 1. Buat pool data RGW menggunakan profil EC
sudo ceph osd pool create labpro-zone.rgw.buckets.data erasure labpro-ec-profile

# 2. Wajib: Aktifkan izin overwrite pada pool Erasure Coding
sudo ceph osd pool set labpro-zone.rgw.buckets.data allow_ec_overwrites true

# 3. Aktifkan modul aplikasi RGW pada pool tersebut
sudo ceph osd pool application enable labpro-zone.rgw.buckets.data rgw
```

### 8.7. Deploy Layanan Ceph Object Gateway (RGW S3)
Perintahkan orkestrator untuk mendeploy kontainer RGW di VM `ceph-admin` (VM1) pada port `8000`:
```bash
sudo ceph orch apply rgw labpro-s3 \
  --realm=labpro-realm \
  --zone=labpro-zone \
  --placement="1 ceph-admin" \
  --port=8000
```
Verifikasi bahwa kontainer RGW telah berjalan sukses:
```bash
sudo ceph orch ps --daemon-type rgw
```

---

## 9. Pembuatan Pengguna S3 & Bucket Default

Agar aplikasi backend dapat mengunggah dan mengunduh berkas dari Ceph RGW, kita harus membuat akun pengguna S3 baru dan membuat satu *bucket* penyimpanan utama.

### 9.1. Buat Pengguna RGW S3 Baru
```bash
sudo radosgw-admin user create \
  --uid="labpro-user" \
  --display-name="Labpro Storage Cloud User" \
  --system
```
*Penting: Catat nilai `access_key` dan `secret_key` yang muncul pada output JSON perintah di atas. Kredensial ini digunakan untuk mengisi file `.env` aplikasi backend.*

### 9.2. Membuat Bucket Menggunakan s3cmd
Kita akan menginstal utilitas klien S3 gratisan bernama `s3cmd` di VM1 untuk membuat bucket utama di Ceph.

#### 1. Instalasi s3cmd
```bash
sudo apt install -y s3cmd
```

#### 2. Konfigurasi s3cmd
Jalankan interaktif wizard konfigurasi:
```bash
s3cmd --configure
```
Isi parameter interaktif sebagai berikut:
*   **Access Key & Secret Key**: Masukkan kredensial dari langkah 9.1.
*   **S3 Endpoint**: `100.68.13.84:8000` (IP Tailscale VM1 port RGW).
*   **DNS-style bucket format**: `100.68.13.84:8000/%(bucket)s` (Wajib, karena RGW kita tidak menggunakan DNS subdomain).
*   **Use HTTPS**: `no`

#### 3. Sesuaikan Signature API Manual
Buka file konfigurasi `~/.s3cfg` yang baru terbentuk:
```bash
nano ~/.s3cfg
```
Ubah/tambahkan parameter berikut agar Ceph RGW mengenali request s3cmd secara benar tanpa memicu error 403 Forbidden:
```ini
bucket_location = us-east-1
signature_v2 = True
```

#### 4. Buat Bucket Default Utama
Buat bucket bernama `labpro-storage`:
```bash
s3cmd mb s3://labpro-storage
```

---

## 10. Konfigurasi Centralized Logging (Fluent Bit + OpenSearch)

Untuk memantau aktivitas server, kita mendeploy kluster pencatatan log terpusat. Agen **Fluent Bit** akan membaca file log aplikasi backend (format JSON) dan file log Ceph (format teks biasa), mem-parsing isinya, lalu mengirimkannya ke database indeks **OpenSearch** di VM `ceph-admin`.

### 10.1. Jalankan OpenSearch di VM1 (ceph-admin)
OpenSearch membutuhkan kapasitas memory virtual OS yang tinggi agar tidak mengalami crash saat inisiasi.

#### 1. Set Memory Virtual Host
```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

#### 2. Jalankan Kontainer OpenSearch
Navigasi ke folder proyek backend, lalu jalankan docker-compose:
```bash
cd /root/cloud-backend
sudo docker-compose -f docker-compose-opensearch.yml up -d
```
*Catatan: OpenSearch akan berjalan secara aman pada port `9200` dengan user `admin` dan password default `admin`.*

### 10.2. Konfigurasi Agen Fluent Bit di VM1
Fluent Bit akan dipasang langsung pada sistem operasi host VM `ceph-admin`.

#### 1. Aktifkan Fitur Output Log File di Ceph
Secara default, Ceph menulis log ke memory daemon. Kita harus memaksa Ceph agar menulis log ke file fisik `/var/log/ceph/`:
```bash
sudo ceph config set global log_to_file true
sudo ceph config set global mon_cluster_log_to_file true
```

#### 2. Instalasi Fluent Bit
```bash
curl -fsSL https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh
```

#### 3. Konfigurasi Aturan Fluent Bit
Salin file konfigurasi input-output log yang telah disiapkan di folder proyek backend ke folder sistem `/etc/fluent-bit/`:
```bash
sudo cp /root/cloud-backend/fluent-bit.conf /etc/fluent-bit/fluent-bit.conf
sudo cp /root/cloud-backend/parsers.conf /etc/fluent-bit/parsers.conf
```

Pastikan isi berkas `/etc/fluent-bit/fluent-bit.conf` telah terkonfigurasi untuk menangkap log backend dan log Ceph:
```ini
[SERVICE]
    flush        1
    daemon       off
    log_level    info
    parsers_file parsers.conf

[INPUT]
    name             tail
    path             /root/cloud-backend/logs/cloud-backend.log
    parser           json
    tag              labpro.app.logs
    refresh_interval 5
    mem_buf_limit    5mb
    skip_long_lines  on

[INPUT]
    name             tail
    path             /var/log/ceph/*/ceph.log
    parser           ceph
    tag              labpro.ceph.logs
    refresh_interval 5
    mem_buf_limit    5mb
    skip_long_lines  on

[OUTPUT]
    name            opensearch
    match           labpro.app.logs
    host            127.0.0.1
    port            9200
    http_user       admin
    http_passwd     admin
    index           labpro-web-logs
    type            _doc
    tls             on
    tls.verify      off
    suppress_type_name on

[OUTPUT]
    name            opensearch
    match           labpro.ceph.logs
    host            127.0.0.1
    port            9200
    http_user       admin
    http_passwd     admin
    index           labpro-ceph-logs
    type            _doc
    tls             on
    tls.verify      off
    suppress_type_name on
```

Pastikan berkas `/etc/fluent-bit/parsers.conf` mendefinisikan parser regex untuk membaca log internal Ceph secara rapi:
```ini
[PARSER]
    Name        json
    Format      json
    Time_Key    timestamp
    Time_Format %Y-%m-%dT%H:%M:%S.%L%z
    Time_Keep   On

[PARSER]
    Name        ceph
    Format      regex
    Regex       ^(?<time>[^ ]+) (?<entity>[^ ]+) \((?<daemon>[^)]+)\) (?<seq>\d+) : (?<subsystem>[^ ]+) \[(?<priority>[^\]]+)\] (?<message>.*)$
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L%z
    Time_Keep   On
```

#### 4. Jalankan Layanan Fluent Bit
```bash
sudo systemctl restart fluent-bit
sudo systemctl enable fluent-bit
```

---

## 11. Deployment Aplikasi Web ke VM (Nginx + SSL/TLS)

Aplikasi web "Labpro Storage" berjalan secara terintegrasi di VM `ceph-admin` (VM1) dengan Nginx sebagai gerbang utama SSL/TLS HTTPS.

### 11.1. Setup Database PostgreSQL di VM
Instal PostgreSQL di VM `ceph-admin`:
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# Buat database baru dan pasang password user postgres
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD '123456789';"
sudo -u postgres psql -c "CREATE DATABASE skripsi_cloud OWNER postgres;"
```

### 11.2. Build & Deploy Frontend (React + Vite)
1.  Di komputer lokal (laptop) Anda, jalankan proses build produksi dengan mengarahkan base API ke alamat IP Tailscale VM:
    ```powershell
    # PowerShell Komputer Lokal (Laptop)
    $env:VITE_API_BASE_URL="https://100.68.13.84"
    npm run build
    ```
2.  Unggah folder hasil build (`dist/`) ke VM1 menggunakan perintah SCP:
    ```powershell
    # PowerShell Komputer Lokal (Laptop)
    scp -r dist/ root@100.68.13.84:/var/www/labpro-storage/
    ```

### 11.3. Deploy Backend (Bun / ElysiaJS)
1.  Unggah kode sumber backend ke VM1:
    ```powershell
    # PowerShell Komputer Lokal (Laptop)
    scp -r cloud-backend/ root@100.68.13.84:/root/
    ```
2.  Masuk ke SSH VM1, pasang modul dependensi, dan sinkronisasikan skema tabel database PostgreSQL menggunakan Drizzle ORM:
    ```bash
    cd /root/cloud-backend
    bun install
    bun run db:push
    ```
3.  Sesuaikan file konfigurasi environment `/root/cloud-backend/.env` di VM:
    ```properties
    NODE_ENV="production"
    DATABASE_URL="postgres://postgres:123456789@127.0.0.1:5432/skripsi_cloud"
    JWT_SECRET="rahasia_jwt_sangat_panjang_dan_aman_labpro"
    FRONTEND_URL="https://100.68.13.84"
    PORT=3001
    
    # Kredensial RGW S3
    S3_ENDPOINT="http://127.0.0.1:8000"
    S3_ACCESS_KEY_ID="ISI_DENGAN_ACCESS_KEY_LANGKAH_9.1"
    S3_SECRET_ACCESS_KEY="ISI_DENGAN_SECRET_KEY_LANGKAH_9.1"
    S3_BUCKET_NAME="labpro-storage"
    S3_REGION="us-east-1"
    
    # Metrik Ceph
    CEPH_PROM_URL="http://127.0.0.1:9283/metrics"
    ```
4.  Buat berkas unit systemd `/etc/systemd/system/cloud-backend.service` agar backend otomatis menyala saat server reboot:
    ```ini
    [Unit]
    Description=Labpro Storage Backend Service
    After=network.target

    [Service]
    Type=simple
    User=root
    WorkingDirectory=/root/cloud-backend
    ExecStart=/root/.bun/bin/bun run src/index.ts
    Restart=on-failure
    Environment=NODE_ENV=production

    [Install]
    WantedBy=multi-user.target
    ```
    Aktifkan dan jalankan backend:
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable --now cloud-backend
    ```

### 11.4. Pembuatan Sertifikat SSL & Konfigurasi Nginx
Kita akan membuat sertifikat SSL self-signed dan memasangnya di Nginx untuk mengaktifkan enkripsi HTTPS.

#### 1. Buat Sertifikat SSL
```bash
sudo openssl req -x509 -nodes -days 36500 -newkey rsa:2048 \
  -keyout /etc/ssl/private/nginx-selfsigned.key \
  -out /etc/ssl/certs/nginx-selfsigned.crt
```

#### 2. Konfigurasi Nginx Reverse Proxy
Pasang Nginx:
```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```
Buat file konfigurasi baru di `/etc/nginx/sites-available/labpro-storage`:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name 100.68.13.84;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name 100.68.13.84;

    ssl_certificate /etc/ssl/certs/nginx-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/nginx-selfsigned.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Wajib: Batasi ukuran unggahan maksimal (0 = Tanpa batasan di tingkat Nginx, biarkan backend membatasi hingga 500GB)
    client_max_body_size 0;

    # Jalur File Static Frontend
    location / {
        root /var/www/labpro-storage/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API Auth Backend
    location /auth/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy API Files Backend (Termasuk streaming upload / download)
    location /files/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Penyetelan timeout untuk mencegah putusnya unggahan berkas berukuran besar (500GB)
        proxy_connect_timeout 86400s;
        proxy_send_timeout    86400s;
        proxy_read_timeout    86400s;
        send_timeout          86400s;
    }
}
```

#### 3. Aktifkan Konfigurasi & Restart Nginx
```bash
# Buat symlink aktif
sudo ln -s /etc/nginx/sites-available/labpro-storage /etc/nginx/sites-enabled/
# Hapus default page bawaan Nginx agar tidak konflik
sudo rm -f /etc/nginx/sites-enabled/default

# Tes konfigurasi
sudo nginx -t
# Restart Nginx
sudo systemctl restart nginx
```
Aplikasi web sekarang sudah dapat diakses dengan aman di browser host Anda menggunakan alamat **`https://100.68.13.84`**.

---

## 12. Catatan Troubleshooting & Penyelesaian Masalah

Berikut adalah kendala-kendala umum yang ditemui beserta solusinya:

### 12.1. Konflik Port 3000 dengan Grafana Ceph
*   **Masalah**: Aplikasi backend gagal berjalan dengan pesan error *EADDRINUSE* (port sudah terpakai).
*   **Penyebab**: Cephadm secara default menggunakan port `3000` untuk menjalankan kontainer monitoring Grafana di VM1.
*   **Solusi**: Ubah port backend aplikasi kita ke `3001` (di berkas `.env` backend) dan arahkan blok `proxy_pass` pada file konfigurasi Nginx ke port `3001`.

### 12.2. Hilangnya Indeks Log OpenSearch Saat Kontainer Dihapus
*   **Masalah**: Seluruh data riwayat log dan *Index Pattern* menghilang setelah docker-compose dimatikan/dihapus.
*   **Penyebab**: Konfigurasi kontainer awal menyimpan data di dalam folder kontainer yang bersifat sementara (*ephemeral*).
*   **Solusi**: Tambahkan volume docker persisten pada file `docker-compose-opensearch.yml` untuk memetakan direktori data OpenSearch ke harddisk VM secara permanen (`/var/lib/docker/volumes/`).

### 12.3. Kegagalan Membuat Folder Baru di Halaman Utama (Root)
*   **Masalah**: Mengalami error 400 Bad Request saat membuat folder di halaman utama, namun berhasil jika dibuat di dalam sub-folder.
*   **Penyebab**: Di halaman utama, ID folder bernilai `null`. Skema validasi backend `t.Optional(t.String())` menolak tipe data `null` karena menganggap tipe tersebut tidak sesuai.
*   **Solusi**: Perbarui validasi skema input di backend (`src/files/index.ts`) menggunakan union type secara eksplisit: `parentId: t.Optional(t.Union([t.String(), t.Null()]))`.

### 12.4. Portabilitas Cluster VM di Mode Bridged Adapter VirtualBox
*   **Masalah**: Saat Mini PC dipindahkan ke router baru, IP VM berubah dan kluster tidak terhubung.
*   **Penyebab**: Mode *Bridged Adapter* meminta IP baru dari DHCP router fisik yang aktif.
*   **Solusi**:
    1.  Pastikan konfigurasi kartu jaringan di dalam sistem Linux VM disetel menggunakan **DHCP (Automatic)**, bukan IP statis. Ini memastikan VM selalu mendapatkan akses internet di mana pun Mini PC terhubung.
    2.  Pastikan semua konfigurasi kluster Ceph, backend, dan frontend diikat ke **IP Tailscale (`100.X.X.X`)**. Karena IP Tailscale tidak akan berubah meskipun IP lokal fisik VM berubah, kluster Anda akan langsung terhubung secara otomatis di jaringan mana pun.
