import { useNavigate } from 'react-router-dom'
import { GradientHeader } from '@/components/ui'

const LAST_UPDATED = '29 Juni 2026'

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-1.5">{title}</h2>
      <div className="text-sm text-gray-600 leading-relaxed space-y-2">{children}</div>
    </div>
  )
}

export default function PrivacyPolicyPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <GradientHeader
        title="Kebijakan Privasi"
        subtitle={`Terakhir diperbarui: ${LAST_UPDATED}`}
        back={() => navigate(-1)}
      />

      <div className="px-4 pt-5 max-w-2xl mx-auto">
        <Section title="1. Pendahuluan">
          <p>
            ESC Siantan ("kami", "aplikasi") menghormati privasi setiap jemaat dan volunteer
            yang menggunakan aplikasi ini. Kebijakan ini menjelaskan data pribadi apa saja yang
            kami kumpulkan, untuk apa data tersebut dipakai, bagaimana kami melindunginya, dan
            hak Anda atas data tersebut — sesuai dengan Undang-Undang No. 27 Tahun 2022 tentang
            Pelindungan Data Pribadi (UU PDP).
          </p>
          <p>
            Dengan mendaftar dan menggunakan aplikasi ini, Anda menyetujui pengumpulan dan
            pemrosesan data sebagaimana dijelaskan dalam kebijakan ini.
          </p>
        </Section>

        <Section title="2. Data yang Kami Kumpulkan">
          <p><strong className="text-gray-800">a. Data identitas &amp; kontak</strong> — nama, email, nomor WhatsApp, jenis kelamin, tanggal &amp; tempat lahir, alamat, golongan darah, akun media sosial, foto profil.</p>
          <p><strong className="text-gray-800">b. Data sensitif</strong> — NIK (Nomor Induk Kependudukan), khusus saat Anda mengajukan pendaftaran Baptisan atau Pemberkatan Nikah.</p>
          <p><strong className="text-gray-800">c. Data keanggotaan &amp; pelayanan</strong> — komsel, ministry, riwayat kehadiran kelas/komsel/event (lewat scan QR), jawaban tugas/SOP pelayanan.</p>
          <p><strong className="text-gray-800">d. Data persembahan</strong> — kategori dan nominal persembahan yang Anda catat sendiri, beserta foto bukti transfer (jika diunggah).</p>
          <p><strong className="text-gray-800">e. Data teknis</strong> — token notifikasi push (jika Anda mengaktifkannya), agar kami bisa mengirim pengingat/notifikasi ke perangkat Anda.</p>
        </Section>

        <Section title="3. Tujuan Penggunaan Data">
          <p>Data di atas kami gunakan untuk:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Mengelola keanggotaan jemaat &amp; volunteer (profil, komsel, ministry).</li>
            <li>Memproses pendaftaran Baptisan, Pemberkatan Nikah, kelas, dan event gereja.</li>
            <li>Mencatat kehadiran (absensi) kelas, komsel, dan event.</li>
            <li>Mengirim notifikasi/pengingat terkait tugas pelayanan, informasi, dan event.</li>
            <li>Pencatatan internal persembahan oleh jemaat yang bersangkutan.</li>
            <li>Komunikasi terkait akun (aktivasi, reset password) lewat WhatsApp.</li>
          </ul>
          <p>Kami <strong className="text-gray-800">tidak</strong> menjual atau menyewakan data pribadi Anda kepada pihak ketiga mana pun untuk tujuan komersial.</p>
        </Section>

        <Section title="4. Penyimpanan &amp; Keamanan Data">
          <p>
            Data disimpan di infrastruktur Supabase dengan akses dibatasi lewat Row Level
            Security — setiap jemaat hanya bisa melihat datanya sendiri, dan data sensitif
            (seperti biodata lengkap) hanya dapat diubah oleh Super Admin gereja. Kata sandi
            akun dienkripsi dan tidak dapat dilihat oleh siapa pun, termasuk pengelola aplikasi.
          </p>
        </Section>

        <Section title="5. Pembagian Data ke Pihak Ketiga">
          <p>Kami membagikan sebagian data secara terbatas ke penyedia layanan berikut, semata untuk menjalankan fitur aplikasi:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-gray-800">Fonnte</strong> — pengiriman kode OTP &amp; notifikasi lewat WhatsApp.</li>
            <li><strong className="text-gray-800">Google Firebase Cloud Messaging</strong> — pengiriman notifikasi push (jika diaktifkan).</li>
          </ul>
          <p>Kami tidak membagikan data Anda ke pihak lain di luar yang disebutkan, kecuali diwajibkan oleh hukum.</p>
        </Section>

        <Section title="6. Hak Anda atas Data Pribadi">
          <p>Sesuai UU PDP, Anda berhak untuk:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Melihat dan memperbarui data pribadi Anda lewat menu Profil &amp; Edit Profil.</li>
            <li>Meminta koreksi data yang tidak dapat Anda ubah sendiri, lewat Admin gereja.</li>
            <li>Meminta penghapusan akun &amp; data pribadi Anda secara permanen, lewat Admin gereja.</li>
            <li>Menarik persetujuan notifikasi push kapan saja lewat menu Pengaturan.</li>
          </ul>
        </Section>

        <Section title="7. Penyimpanan Data">
          <p>
            Data Anda kami simpan selama Anda masih tercatat sebagai jemaat/volunteer aktif.
            Jika akun dihapus (atas permintaan Anda atau oleh Admin), data profil dan akun
            login dihapus secara permanen dari sistem kami.
          </p>
        </Section>

        <Section title="8. Perubahan Kebijakan">
          <p>
            Kami dapat memperbarui kebijakan ini dari waktu ke waktu. Perubahan signifikan
            akan diinformasikan lewat aplikasi. Tanggal "Terakhir diperbarui" di atas
            menunjukkan revisi terbaru.
          </p>
        </Section>

        <Section title="9. Kontak">
          <p>
            Pertanyaan atau permintaan terkait data pribadi Anda dapat disampaikan ke
            pengurus/admin ESC Siantan melalui aplikasi, atau email{' '}
            <a href="mailto:escdisiplin@gmail.com" className="text-brand-500 font-medium">escdisiplin@gmail.com</a>.
          </p>
        </Section>
      </div>
    </div>
  )
}
