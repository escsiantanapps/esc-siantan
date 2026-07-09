---
name: audit-rls
description: Audit keamanan RLS/policy/trigger khas ESC Siantan — drift-aware, per jenjang role (Jemaat → Volunteer → PKS → Admin → Super Admin), fokus pada bypass PostgREST langsung dan validasi yang cuma di klien. Gunakan saat diminta "audit", "pentest", "cek keamanan", "review RLS", atau sebelum membuka jalur tulis baru (tabel/RPC/endpoint baru).
---

# Audit Keamanan RLS ESC Siantan

Konteks: aplikasi ini memakai anon key Supabase di klien — SIAPA PUN yang login bisa memanggil PostgREST langsung dengan payload apa pun, melewati seluruh UI React. Satu-satunya pertahanan nyata = RLS + trigger penjaga + fungsi SECURITY DEFINER di database, plus endpoint `api/` (service role). Audit-audit sebelumnya (v23, v31, v38–v42) berulang kali menemukan pola yang sama: **aturan bisnis hanya ditegakkan di klien**. Skill ini menstandarkan cara mengulangi audit itu tanpa mengulangi kesalahannya.

## Langkah

### 1. Tetapkan lingkup
Sepakati dengan user salah satu dari:
- **Per tabel/fitur** (mis. "audit offerings", "audit alur izin"), atau
- **Per jenjang penyerang** (mis. "apa yang bisa dilakukan Volunteer yang jahat?"), atau
- **Jalur tulis baru** yang baru dibuat (pre-flight sebelum rilis).

Jenjang penyerang, urut dari terlemah: anonim (tanpa login) → Jemaat → Volunteer → PKS → Admin biasa (dengan Hak Akses dibatasi) → Super Admin. Audit terdahulu fokus Jemaat/Volunteer/PKS; jenjang **Admin** baru mulai digarap v41 — celah antar-admin masih area paling rawan.

### 2. Ambil ground truth dari PRODUCTION (bukan schema.sql)
`schema.sql` TERBUKTI drift dari production (news/events punya policy tulis yang tidak tercatat di file). Sebelum menilai apa pun, minta user jalankan di Supabase SQL Editor dan tempelkan hasilnya:

```sql
-- Semua policy + status RLS per tabel
SELECT c.relname AS tabel, c.relrowsecurity AS rls_aktif,
       p.polname AS policy, p.polcmd AS cmd,
       ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)) AS roles,
       pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname, p.polname;

-- Semua trigger penjaga
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE trigger_schema = 'public'
ORDER BY event_object_table;
```
Tandai setiap selisih file↔production sebagai temuan tersendiri ("drift").

### 3. Petakan SEMUA jalur tulis dalam lingkup
Untuk tiap tabel dalam lingkup, daftar dari tiga arah:
1. **Klien** — grep pemanggil di `src/services/*.js` (`.insert(`, `.update(`, `.delete(`, `.rpc(`).
2. **PostgREST langsung** — anggap penyerang bisa kirim kolom APA PUN di payload, bukan cuma yang ada di form UI (kasus nyata: jemaat meng-update `sp_level` dirinya sendiri lewat `users_edit_own`).
3. **`api/` (service role)** — endpoint mana yang menulis tabel ini, dan apa validasi pemanggilnya.

### 4. Checklist serangan (jalankan per jenjang, per tabel)
- [ ] **Kolom privilege**: bisakah jenjang ini mengubah `role`, `role_secondary`, `is_pks`, `status`, `sp_level/sp_notes`, `points`, `nij`, kolom kartu jemaat — langsung via payload? (Penjaga: `guard_user_privilege_cols`; `role/role_secondary` = Super Admin saja, `is_pks` = `auth_admin_can('/admin/komsel')`.)
- [ ] **Self-approval / status bypass**: bisakah pengaju mengubah status pendaftarannya sendiri jadi "Disetujui" (baptisan/nikah/penyerahan anak/KTJ/izin/persembahan)? (Pola v40.)
- [ ] **Aturan bisnis client-only**: batas frekuensi, jadwal buka-tutup, kelayakan role/ministry — apakah ditegakkan DB atau cuma React? (Pola v42 `guard_once_per_day`.)
- [ ] **Farming poin**: adakah jalur insert kehadiran yang memberi +1 poin tanpa batas? (Trigger poin menempel di `class/event/sunday/komsel_attendance`.)
- [ ] **Privasi**: bisakah jenjang ini MEMBACA NIK / biodata / data keuangan orang lain via select langsung? (NIK = Super Admin saja; PKS lihat anggota komselnya tanpa NIK.)
- [ ] **Hak Akses nyata vs kosmetik**: untuk Admin dibatasi — apakah gerbang tulisnya `auth_admin_can('/admin/<page>')` atau masih `role IN ('Admin','Super Admin')` (= kosmetik, temuan inti v41-B)?
- [ ] **Endpoint publik**: rate limit terpasang? Bisa dipakai enumerasi (cek nomor HP/email)? Error membocorkan internal?
- [ ] **Fungsi SECURITY DEFINER**: `search_path` di-pin? `REVOKE FROM PUBLIC`? Validasi argumen (bukan percaya klien)?
- [ ] **Semantik `caller_role NULL`**: guard melewati NULL (backend tepercaya) secara sengaja — pastikan itu masih benar untuk objek yang diaudit, dan tidak ada jalur user login yang bisa tampil sebagai NULL.

### 5. Temuan yang SUDAH diketahui (jangan dilaporkan sebagai baru)
- **Points farming PKS**: PKS bisa membuat `komsel_sessions` tak terbatas + insert `komsel_attendance` massal (+1 poin/baris). Diketahui, belum diperbaiki (severity sedang; ada jejak `point_transactions`).
- **Sweep v41-B belum selesai**: ±30 policy tulis admin (offerings, baptism, ministries, komsel_*, dll.) masih `role IN ('Admin','Super Admin')`, belum `auth_admin_can()`. DITAHAN menunggu inventaris production (karena drift). Komplikasi tercatat: `users_admin_update` menggerbang banyak domain sekaligus; tabel `komsel_*` dipakai PKS juga → gerbang harus `auth_admin_can(...) OR auth_leads_komsel(...)`.
- **Masih client-only (ditawarkan, belum diputuskan)**: kelayakan role/ministry & jadwal buka-tutup saat submit form (`responses_own` hanya cek `volunteer_id` = diri sendiri).
- Race `once_per_day` tanpa unique constraint: diterima untuk skala jemaat.

### 6. Format laporan temuan
Per temuan:
1. **TEMUAN** — satu kalimat + jenjang penyerang.
2. **Bukti** — policy/kode persisnya (file:baris atau nama policy production).
3. **Jalur eksploit** — langkah konkret via PostgREST/endpoint.
4. **Severity** — Kritis (eskalasi role / baca-tulis data orang lain) / Tinggi (bypass aturan bisnis dengan dampak uang-poin-status) / Sedang (butuh kombinasi / meninggalkan jejak) / Rendah.
5. **Usulan fix** — sebagai blok migrasi mengikuti skill `migrasi-db` (idempotent, helper existing, komentar TEMUAN/KEPUTUSAN).

Urutkan dari paling parah. Sertakan juga daftar "sudah dicek, aman" supaya audit berikutnya tidak mengulang.

### 7. Sesudahnya
- **JANGAN langsung menerapkan fix** yang mengubah semantik akses — di proyek ini itu selalu KEPUTUSAN OPERATOR (contoh: Hak Akses lingkup tulis-saja, PKS = hak admin komsel). Sodorkan opsi + rekomendasi, tunggu keputusan, baru tulis migrasinya.
- Fix yang murni menutup celah tanpa pilihan desain (mis. kolom lupa dijaga guard) boleh langsung ditulis sebagai draf migrasi, tetap belum di-commit.
- Perbarui catatan status keamanan proyek (memory `plan-backup-and-security` bila tersedia) dengan temuan & keputusan baru.
