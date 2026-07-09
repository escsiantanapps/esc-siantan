---
name: rilis
description: Ritual rilis ESC Siantan — verifikasi build, konfirmasi user, commit dengan format proyek, push ke master SAJA, deteksi webhook Vercel macet, dan checklist pasca-deploy (migrasi SQL + tes manual). Gunakan saat diminta "commit", "push", "deploy", "rilis", "naikkan", atau saat pekerjaan coding selesai dan siap dikirim ke production.
---

# Rilis ke Production (escsiantan.my.id)

Konteks: push ke `master` = deploy production OTOMATIS ke gereja yang aktif memakai app ini. Tidak ada staging. Skill ini menegakkan urutan yang benar dan dua aturan yang pernah dilanggar dengan akibat nyata: push ke `main` (bikin preview URL membingungkan) dan webhook Vercel yang diam-diam tidak terpicu.

## Langkah

### 1. Inventaris perubahan
```
git status --short
git diff --stat
```
- Kelompokkan: file yang memang bagian dari tugas vs file kerja untracked (pptx, `PROJECT_HANDOFF.md`, `task.md`, `implementation_plan.md`, `rn-preview/`, `panduan/*` baru, dll — ini SENGAJA tidak di-commit).
- **Jangan pernah `git add .` atau `git add -A`.** Stage hanya path yang eksplisit kamu sebutkan ke user.

### 2. Gerbang build
```
npx vite build
```
Harus exit 0. Kalau gagal: perbaiki dulu, jangan pernah commit build merah. Ini SATU-SATUNYA gerbang verifikasi otomatis proyek ini (tidak ada test).

### 3. Konfirmasi user (WAJIB — tidak ada pengecualian)
Tunjukkan ke user, lalu TUNGGU jawaban:
1. Daftar file yang akan di-stage.
2. Usulan pesan commit, format proyek: `feat|fix|refactor|chore|docs|clean: deskripsi singkat bahasa Indonesia` (lihat `git log --oneline` untuk nadanya; deskripsi menyebut fitur/halaman, bukan nama file).
3. **Peringatan migrasi**: bila `supabase/schema.sql` ikut berubah, tegaskan "commit ini berisi Migrasi vNN yang harus kamu jalankan di Supabase SQL Editor — idealnya SEBELUM/segera setelah deploy" dan jelaskan apa yang rusak kalau belum dijalankan (fitur baru error? atau aman karena idempotent-additive?).

Build hijau BUKAN izin commit. Persetujuan sesi sebelumnya BUKAN izin sesi ini.

### 4. Commit & push
```
git add <path-eksplisit...>
git commit -m "<pesan yang disetujui>"
git push origin master
```
- **HANYA `master`.** Jangan pernah push ke `main` atau `master:main` — itu membuat preview deployment (`gerejaku-git-main-*.vercel.app`) yang tampak seperti "link baru" dan membingungkan user. (Vercel project-nya bernama `gerejaku`; `escsiantan.my.id` & `esc-siantan.vercel.app` adalah domain production-nya.)

### 5. Webhook Vercel macet (masalah berulang — sudah terjadi ≥2×)
Gejala: push sukses ke GitHub tapi commit TIDAK muncul sama sekali di daftar deployment Vercel.
- Setelah push, minta user cek dashboard Vercel (atau tunggu laporannya).
- Bila macet:
  ```
  git commit --allow-empty -m "chore: trigger vercel redeploy (commit <hash> tersangkut)"
  git push origin master
  ```
  Commit kosong memicu ulang webhook dan build barunya membawa commit yang tersangkut.
- Bila ini kejadian **ketiga kalinya atau lebih**: sarankan user reconnect repo di Vercel Settings → Git.

### 6. Laporan pasca-rilis (wajib, format tetap)
1. **Hasil**: hash commit + "sudah di-push ke master, Vercel akan auto-deploy ke escsiantan.my.id".
2. **Migrasi**: daftar `vNN` yang harus dijalankan user di Supabase SQL Editor (termasuk migrasi lama yang kamu tahu belum dijalankan — tanya bila tidak yakin).
3. **Tes manual**: langkah konkret per fitur yang berubah, sebut role yang dipakai (contoh: "login sebagai Volunteer → SOP Rohani → buka form X → pastikan badge 'Tutup' muncul di luar jam"). Ingat: tidak ada kredensial tersimpan untuk dites otomatis — user yang mengetes.
4. **Konfigurasi manual** bila ada (env var baru di Vercel, bucket Storage, redirect URL Supabase Auth).

## Jangan
- Jangan commit/push tanpa konfirmasi eksplisit di sesi ini.
- Jangan `--force`, jangan amend commit yang sudah di-push.
- Jangan menyertakan `schema.sql` setengah jadi — blok migrasi ikut commit hanya bila sudah final dan sudah dilaporkan ke user.
