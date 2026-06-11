# Panduan Migrasi & Setup Cluster Ceph S3 (Labpro Storage)

Dokumen ini berisi catatan langkah-langkah setup dan migrasi kluster Ceph Object Storage (S3-compatible) pada arsitektur 3 Virtual Machine (VM) berbasis Ubuntu Server 22.04 LTS. Jaringan antar VM dihubungkan via Tailscale VPN, dengan Chrony (NTP) untuk sinkronisasi waktu.

---

## 1. Arsitektur & Topologi Jaringan

Kluster terdiri dari 3 VM dengan diagram topologi berikut:

```mermaid
graph TD
    subgraph Jaringan Tailscale (100.64.0.0/10)
        VM1[VM1: ceph-admin<br/>Mgr / Mon / RGW S3<br/>IP: 100.68.13.84]
        VM2[VM2: ceph-node1<br/>OSD 1 /dev/sdb<br/>IP: 100.71.47.41]
        VM3[VM3: ceph-node2<br/>OSD 2 /dev/sdb<br/>IP: 100.75.133.14]
    end
    
    Nginx[Nginx Proxy / SSL]<br/>IP: 100.68.13.84:443 -->|Reverse Proxy| App[Bun Backend]<br/>IP: 127.0.0.1:3001
    App -->|S3 Presigned URL| VM1
    VM1 -->|Manage OSD| VM2
    VM1 -->|Manage OSD| VM3
```

### Detail Alamat IP & Peran Node
1. **ceph-admin (VM1)**:
   * IP Lokal: `192.168.100.65`
   * IP Tailscale: `100.68.13.84`
   * Peran: Manager, Monitor, S3 RGW Gateway, OpenSearch, Nginx Server, App Backend, Postgres Database
2. **ceph-node1 (VM2)**:
   * IP Lokal: `192.168.100.66`
   * IP Tailscale: `100.71.47.41`
   * Peran: Monitor, Storage Node OSD 1 (`/dev/sdb`)
3. **ceph-node2 (VM3)**:
   * IP Lokal: `192.168.100.67`
   * IP Tailscale: `100.75.133.14`
   * Peran: Monitor, Storage Node OSD 2 (`/dev/sdb`)

*Catatan: Setiap VM memiliki disk utama untuk OS (`/dev/sda`) dan satu disk tambahan kosong (`/dev/sdb` 25GB-50GB, unformatted) untuk penyimpanan Ceph OSD.*

---

## 2. Persiapan Sistem & Jaringan (Semua Node)

Jalankan perintah berikut pada ketiga VM:

### 2.1. Update OS
```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2. Atur Password Root
Buat password root di masing-masing VM agar SSH antar node lancar:
```bash
sudo passwd root
```

### 2.3. Konfigurasi SSH Server (Izinkan Akses Root)
```bash
sudo apt install -y openssh-server
```
Buka konfigurasi SSH:
```bash
sudo nano /etc/ssh/sshd_config
```
Pastikan `PermitRootLogin` disetel ke `yes`:
```text
PermitRootLogin yes
```
Simpan file, lalu restart SSH:
```bash
sudo sshd -t
sudo systemctl restart ssh
```

### 2.4. Koneksi Tailscale VPN & Konfigurasi /etc/hosts
Install Tailscale di semua node:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
Setelah login selesai, tambahkan IP Tailscale ke berkas `/etc/hosts` di ketiga VM:
```bash
sudo nano /etc/hosts
```
Tambahkan di bagian paling bawah:
```text
100.68.13.84 ceph-admin
100.71.47.41 ceph-node1
100.75.133.14 ceph-node2
```

### 2.5. Sinkronisasi Waktu (Chrony NTP)
Ceph mewajibkan sinkronisasi waktu yang presisi (<0.05 detik). Kita akan menjadikan `ceph-admin` sebagai NTP Server lokal dan node lainnya sebagai Client.

#### 2.5.1. Install Chrony (Semua VM)
```bash
sudo apt install -y chrony
```

#### 2.5.2. Konfigurasi VM1 (ceph-admin) sebagai NTP Server
```bash
sudo nano /etc/chrony/chrony.conf
```
Tambahkan baris berikut di akhir file untuk mengizinkan sinkronisasi dari jaringan Tailscale:
```text
allow 100.64.0.0/10
```
Restart Chrony:
```bash
sudo systemctl restart chrony
```

#### 2.5.3. Konfigurasi VM2 & VM3 sebagai NTP Client
```bash
sudo nano /etc/chrony/chrony.conf
```
Hapus baris server bawaan, lalu tambahkan:
```text
server 100.68.13.84 iburst
```
Restart Chrony:
```bash
sudo systemctl restart chrony
```
Uji status sinkronisasi dengan perintah:
```bash
chronyc sources
timedatectl
```

### 2.6. Instalasi Docker Engine (Semua Node)
```bash
sudo apt install -y docker.io
sudo systemctl enable --now docker
```

---

## 3. Pembersihan Disk Penyimpanan (Semua Node)

Sebelum disk `/dev/sdb` digunakan oleh Ceph, pastikan tabel partisi dan data lama sudah bersih:
```bash
# Cek disk
lsblk

# Hapus tabel partisi
sudo sgdisk --zap-all /dev/sdb

# Bersihkan sisa filesystem
sudo wipefs --all /dev/sdb
```

---

## 4. Konfigurasi Autentikasi SSH Keyless

Cephadm mengontrol seluruh node dari `ceph-admin` menggunakan SSH root tanpa password.

### 4.1. Generate SSH Key di VM1 (ceph-admin)
```bash
sudo ssh-keygen -t rsa -b 4096 -N "" -f /root/.ssh/id_rsa
```

### 4.2. Salin Kunci SSH Root ke Semua VM
```bash
sudo ssh-copy-id root@100.68.13.84
sudo ssh-copy-id root@100.71.47.41
sudo ssh-copy-id root@100.75.133.14
```

---

## 5. Inisiasi Cluster Ceph (Bootstrap di VM1)

Jalankan langkah berikut di terminal `ceph-admin`:

### 5.1. Pasang cephadm
```bash
CEPH_RELEASE=20.2.1
curl --silent --remote-name --location https://download.ceph.com/rpm-${CEPH_RELEASE}/el9/noarch/cephadm
chmod +x cephadm

sudo ./cephadm add-repo --release tentacle
sudo ./cephadm install
```

### 5.2. Bootstrap Cluster
Bootstrap kluster baru menggunakan IP Tailscale `ceph-admin`. Gunakan `--skip-mon-network` karena subnet mask Tailscale `/32`:
```bash
sudo cephadm bootstrap \
  --mon-ip 100.68.13.84 \
  --skip-mon-network \
  --initial-dashboard-user admin \
  --initial-dashboard-password SandiRahasiaCeph123!
```

### 5.3. Atur Jaringan Publik
Tentukan range IP publik Ceph agar mendeteksi jaringan lokal Tailscale:
```bash
sudo ceph config set global public_network "192.168.100.0/24,100.64.0.0/10"
```

### 5.4. Install ceph-common CLI
```bash
sudo cephadm install ceph-common
```

---

## 6. Menghubungkan Node Anggota ke Cluster

Jalankan perintah ini di terminal `ceph-admin`:

### 6.1. Salin SSH Key internal Cephadm
```bash
sudo ceph cephadm get-pub-key > ~/ceph.pub
sudo ssh-copy-id -f -i ~/ceph.pub root@100.68.13.84
sudo ssh-copy-id -f -i ~/ceph.pub root@100.71.47.41
sudo ssh-copy-id -f -i ~/ceph.pub root@100.75.133.14
```

### 6.2. Daftarkan Host
```bash
sudo ceph orch host add ceph-node1 100.71.47.41
sudo ceph orch host add ceph-node2 100.75.133.14
```
Verifikasi host terdaftar:
```bash
sudo ceph orch host ls
```

---

## 7. Pemasangan OSD (Storage Daemon)

Jalankan di terminal `ceph-admin`:

### 7.1. Klaim Disk Otomatis
```bash
sudo ceph orch apply osd --all-available-devices
```

### 7.2. Cek Status OSD
```bash
sudo ceph osd tree
```
Pastikan ketiga OSD (`osd.0`, `osd.1`, dan `osd.2`) berstatus `up` dan `in`.

---

## 8. Konfigurasi Erasure Coding & Gateway S3

Kita menggunakan arsitektur **Erasure Coding (k=2, m=1)** pada pool data RGW S3 untuk menghemat ruang penyimpanan.

Jalankan di terminal `ceph-admin`:

### 8.1. Buat Profil Erasure Coding
```bash
sudo ceph osd erasure-code-profile set labpro-ec-profile \
  plugin=jerasure \
  k=2 \
  m=1 \
  crush-failure-domain=host \
  --force
```

### 8.2. Inisiasi RGW Realm
```bash
sudo radosgw-admin realm create --rgw-realm=labpro-realm --default
```

### 8.3. Buat Zonegroup
```bash
sudo radosgw-admin zonegroup create \
  --rgw-zonegroup=labpro-zonegroup \
  --rgw-realm=labpro-realm \
  --master \
  --default
```

### 8.4. Buat Zone
```bash
sudo radosgw-admin zone create \
  --rgw-zonegroup=labpro-zonegroup \
  --rgw-zone=labpro-zone \
  --master \
  --default \
  --data-pool=labpro-zone.rgw.buckets.data \
  --index-pool=labpro-zone.rgw.buckets.index
```

### 8.5. Terapkan Perubahan Period
```bash
sudo radosgw-admin period update --commit
```

### 8.6. Buat Pool Data Erasure Coding & Aktifkan Overwrite
```bash
# Buat pool data dengan profil EC
sudo ceph osd pool create labpro-zone.rgw.buckets.data erasure labpro-ec-profile

# Aktifkan allow_ec_overwrites agar file S3 bisa dimodifikasi/ditimpa
sudo ceph osd pool set labpro-zone.rgw.buckets.data allow_ec_overwrites true

# Enable aplikasi rgw pada pool
sudo ceph osd pool application enable labpro-zone.rgw.buckets.data rgw
```

### 8.7. Deploy Layanan Rados Gateway (RGW)
Deploy RGW pada port `8000`:
```bash
sudo ceph orch apply rgw labpro-s3 \
  --realm=labpro-realm \
  --zone=labpro-zone \
  --placement="1 ceph-admin" \
  --port=8000
```
Verifikasi daemon status:
```bash
sudo ceph orch ps --daemon-type rgw
```

---

## 9. Pembuatan Pengguna S3 & Bucket Default

### 9.1. Buat Pengguna RGW Baru
```bash
sudo radosgw-admin user create \
  --uid="labpro-user" \
  --display-name="Labpro Storage Cloud User" \
  --system
```
Amankan nilai `access_key` dan `secret_key` dari output perintah di atas untuk konfigurasi `.env`.

### 9.2. Pembuatan Bucket dengan s3cmd
Install dan konfigurasi `s3cmd` di VM:
```bash
sudo apt install -y s3cmd
s3cmd --configure
```
Sesuaikan pengaturannya sebagai berikut:
* **Access Key / Secret Key**: Isi dengan kredensial RGW di atas.
* **S3 Endpoint**: `100.68.13.84:8000`
* **DNS-style bucket format**: `100.68.13.84:8000/%(bucket)s`
* **Use HTTPS**: `no`

Edit file konfigurasi `~/.s3cfg` secara manual untuk menyetel signature format:
```bash
nano ~/.s3cfg
```
Pastikan baris berikut terupdate untuk mencegah error 403:
```ini
bucket_location = us-east-1
signature_v2 = True
```
Buat bucket default:
```bash
s3cmd mb s3://labpro-storage
```

---

## 10. Konfigurasi Centralized Logging (Fluent Bit + OpenSearch)

Kita menggunakan OpenSearch untuk menampung log dari aplikasi backend (JSON format) dan log Ceph (Regex parsed), dengan Fluent Bit sebagai agen pengumpul log.

### 10.1. Jalankan OpenSearch di VM `ceph-admin`
Set memory virtual OS:
```bash
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```
Gunakan file `docker-compose-opensearch.yml` yang ada di direktori project `cloud-backend`:
```bash
cd /root/cloud-backend
sudo docker-compose -f docker-compose-opensearch.yml up -d
```
OpenSearch akan berjalan pada port `9200` dengan user `admin` dan password default `admin`.

### 10.2. Konfigurasi Fluent Bit di VM `ceph-admin`
Fluent Bit dipasang di VM untuk membaca log Ceph (`/var/log/ceph/*/ceph.log`) dan log backend lokal.

#### 1. Aktifkan Fitur Logging ke File di Ceph
```bash
sudo ceph config set global log_to_file true
sudo ceph config set global mon_cluster_log_to_file true
```

#### 2. Install Fluent Bit di VM
```bash
curl -fsSL https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh
```

#### 3. Salin File Konfigurasi ke /etc/fluent-bit
Salin file konfigurasi Fluent Bit yang sudah disediakan di folder backend ke lokasi system:
```bash
sudo cp /root/cloud-backend/fluent-bit.conf /etc/fluent-bit/fluent-bit.conf
sudo cp /root/cloud-backend/parsers.conf /etc/fluent-bit/parsers.conf
```

Atau secara detail isi `/etc/fluent-bit/fluent-bit.conf` disesuaikan:
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

Dan isi `/etc/fluent-bit/parsers.conf`:
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

#### 4. Jalankan Service Fluent Bit
```bash
sudo systemctl restart fluent-bit
sudo systemctl enable fluent-bit
sudo systemctl status fluent-bit
```

---

## 11. Deployment Aplikasi ke VM (Nginx + SSL/TLS)

Aplikasi dipasang secara lokal (*self-hosted*) di dalam VM `ceph-admin`.

### 11.1. Setup Database PostgreSQL di VM
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

# Buat database & user postgres
sudo -u postgres psql -c "CREATE USER postgres WITH PASSWORD '123456789';"
sudo -u postgres psql -c "CREATE DATABASE skripsi_cloud OWNER postgres;"
```

### 11.2. Build & Deploy Frontend (Vite)
1. Di komputer lokal (laptop), build frontend dengan base URL diarahkan ke IP Tailscale VM:
   ```powershell
   # PowerShell lokal
   $env:VITE_API_BASE_URL="https://100.68.13.84"
   npm run build
   ```
2. Kirim berkas `dist/` ke VM:
   ```powershell
   scp -r dist/ root@100.68.13.84:/var/www/labpro-storage/
   ```

### 11.3. Deploy Backend (Bun / ElysiaJS)
1. Kirim kode backend ke VM:
   ```powershell
   scp -r cloud-backend/ root@100.68.13.84:/root/
   ```
2. Hubungkan SSH ke VM, install dependensi, dan lakukan migrasi DB:
   ```bash
   cd /root/cloud-backend
   bun install
   bun run db:push
   ```
3. Konfigurasi file `.env` di VM `/root/cloud-backend/.env`:
   ```properties
   NODE_ENV="production"
   DATABASE_URL="postgres://postgres:123456789@127.0.0.1:5432/skripsi_cloud"
   JWT_SECRET="rahasia_jwt_sangat_panjang_dan_aman"
   FRONTEND_URL="https://100.68.13.84"
   PORT=3001
   
   S3_ENDPOINT="http://127.0.0.1:8000"
   S3_ACCESS_KEY_ID="KREDENSIAL_ACCESS_KEY_RGW"
   S3_SECRET_ACCESS_KEY="KREDENSIAL_SECRET_KEY_RGW"
   S3_BUCKET_NAME="labpro-storage"
   S3_REGION="us-east-1"
   
   CEPH_PROM_URL="http://127.0.0.1:9283/metrics"
   ```

4. Buat service systemd `/etc/systemd/system/cloud-backend.service`:
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
   Aktifkan service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now cloud-backend
   ```

### 11.4. SSL/TLS Certificate & Nginx Setup
Buat sertifikat SSL self-signed:
```bash
sudo openssl req -x509 -nodes -days 36500 -newkey rsa:2048 \
  -keyout /etc/ssl/private/nginx-selfsigned.key \
  -out /etc/ssl/certs/nginx-selfsigned.crt
```

Install Nginx:
```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

Buat konfigurasi site `/etc/nginx/sites-available/labpro-storage`:
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

    # Frontend Static Files
    location / {
        root /var/www/labpro-storage/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Backend API Proxy (menggunakan port 3001 karena port 3000 digunakan oleh Grafana Ceph)
    location /auth/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /files/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Aktifkan konfigurasi site:
```bash
sudo ln -s /etc/nginx/sites-available/labpro-storage /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

Uji dan restart Nginx:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

Kini aplikasi web **Labpro Storage** dapat diakses melalui browser host di alamat **`https://100.68.13.84`**.
