import { useNavigate } from 'react-router-dom'
import { GradientHeader } from '@/components/ui'
import { useLang } from '@/hooks/useLang'

function Section({ title, children }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="text-base text-gray-600 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <GradientHeader title={t('auth.privacyPolicy')} subtitle={t('privacy.updated')} back={() => navigate(-1)} />
      <div className="px-4 pt-5 max-w-2xl mx-auto">
        <Section title={t('privacy.s1.title')}>
          <p>{t('privacy.s1.text0')}</p>
          <p>{t('privacy.s1.text1')}</p>
        </Section>
        <Section title={t('privacy.s2.title')}>
          <p>{t('privacy.s2.text0')}</p>
          <p>{t('privacy.s2.text1')}</p>
          <p>{t('privacy.s2.text2')}</p>
          <p>{t('privacy.s2.text3')}</p>
          <p>{t('privacy.s2.text4')}</p>
        </Section>
        <Section title={t('privacy.s3.title')}>
          <p>{t('privacy.s3.text0')}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t('privacy.s3.text1')}</li>
            <li>{t('privacy.s3.text2')}</li>
            <li>{t('privacy.s3.text3')}</li>
            <li>{t('privacy.s3.text4')}</li>
            <li>{t('privacy.s3.text5')}</li>
            <li>{t('privacy.s3.text6')}</li>
          </ul>
          <p>{t('privacy.s3.text7')}</p>
        </Section>
        <Section title={t('privacy.s4.title')}>
          <p>{t('privacy.s4.text0')}</p>
        </Section>
        <Section title={t('privacy.s5.title')}>
          <p>{t('privacy.s5.text0')}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t('privacy.s5.text1')}</li>
            <li>{t('privacy.s5.text2')}</li>
          </ul>
          <p>{t('privacy.s5.text3')}</p>
        </Section>
        <Section title={t('privacy.s6.title')}>
          <p>{t('privacy.s6.text0')}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>{t('privacy.s6.text1')}</li>
            <li>{t('privacy.s6.text2')}</li>
            <li>{t('privacy.s6.text3')}</li>
            <li>{t('privacy.s6.text4')}</li>
          </ul>
        </Section>
        <Section title={t('privacy.s7.title')}>
          <p>{t('privacy.s7.text0')}</p>
        </Section>
        <Section title={t('privacy.s8.title')}>
          <p>{t('privacy.s8.text0')}</p>
        </Section>
        <Section title={t('privacy.s9.title')}>
          <p>{t('privacy.s9.text0')}{' '}<a href="mailto:escdisiplin@gmail.com" className="text-brand-700 font-medium">escdisiplin@gmail.com</a>.</p>
        </Section>
      </div>
    </div>
  )
}
