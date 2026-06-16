-- ============================================================
-- Migration v16 — Perbaiki PK absensi (bentrok saat insert bersamaan)
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- Gejala: simpan absensi PKS gagal dengan
--   'duplicate key value violates unique constraint "komsel_attendance_pkey"'.
-- Sebab: kolom primary key memakai default berbasis epoch-DETIK
--   (mis. 'KAT-' || extract(epoch from now())::bigint). now() konstan dalam satu
--   statement → menyimpan banyak anggota sekaligus membuat PK identik → bentrok.
--   (class_attendance rentan hal serupa bila dua orang scan di detik yang sama.)
-- Solusi: ubah default PK agar unik per baris (UUID), tanpa mengubah tipe/kolom.

DO $$
DECLARE
  tbl      text;
  pk_col   text;
  pk_count int;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['komsel_attendance', 'class_attendance']
  LOOP
    -- Lewati bila tabel tidak ada.
    IF to_regclass(tbl) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT count(*), min(a.attname)
      INTO pk_count, pk_col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = tbl::regclass
      AND i.indisprimary;

    -- Hanya bila PK satu kolom (surrogate id). PK komposit tidak perlu diubah.
    IF pk_count = 1 THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I SET DEFAULT ''ATT-'' || replace(gen_random_uuid()::text, ''-'', '''')',
        tbl, pk_col
      );
      RAISE NOTICE 'Default PK %.% diubah ke UUID unik.', tbl, pk_col;
    ELSE
      RAISE NOTICE 'PK % bukan kolom tunggal (% kolom) — dilewati.', tbl, pk_count;
    END IF;
  END LOOP;
END $$;
