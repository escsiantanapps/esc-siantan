/**
 * ESC Siantan — React Native Demo
 * ════════════════════════════════
 * File tunggal untuk Expo Snack (https://snack.expo.dev)
 *
 * Cara pakai:
 *   1. Buka https://snack.expo.dev
 *   2. Hapus semua isi App.js
 *   3. Paste seluruh isi file ini
 *   4. Klik "Run" → lihat di panel kanan (Web/Android/iOS)
 *      ATAU scan QR code dengan Expo Go di HP Anda
 *
 * Mencakup: LoginScreen + HomeScreen + UserTabNavigator (mock)
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, StatusBar, FlatList,
  Platform, ActivityIndicator, Animated,
} from 'react-native';

// ─── Constants ──────────────────────────────────────────────────────────────
const BRAND = '#F4511E';

// ─── LOGIN SCREEN ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [show, setShow]           = useState(false);
  const [remember, setRemember]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  async function handleLogin() {
    if (!email || !password) { setError('Email dan password wajib diisi.'); return; }
    setError('');
    setLoading(true);
    // Simulasi network delay
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false);
    if (email === 'demo@esc.id' && password === '123456') {
      onLogin();
    } else {
      setError('Email atau password salah. Coba: demo@esc.id / 123456');
    }
  }

  return (
    <View style={ls.bg}>
      {/* Scrim */}
      <View style={ls.scrim} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={ls.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Glass card */}
          <View style={ls.card}>
            <Text style={ls.eyebrow}>ESC SIANTAN</Text>
            <Text style={ls.title}>Shalom 👋</Text>
            <Text style={ls.desc}>Masuk untuk melanjutkan</Text>

            {!!error && (
              <View style={ls.errorBox}>
                <Text style={ls.errorText}>{error}</Text>
              </View>
            )}

            {/* Email */}
            <View style={ls.inputRow}>
              <TextInput
                style={ls.input}
                placeholder="Email (coba: demo@esc.id)"
                placeholderTextColor="rgba(255,255,255,0.55)"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={ls.inputIcon}>✉️</Text>
            </View>

            {/* Password */}
            <View style={[ls.inputRow, { marginTop: 12 }]}>
              <TextInput
                style={ls.input}
                placeholder="Password (coba: 123456)"
                placeholderTextColor="rgba(255,255,255,0.55)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!show}
              />
              <TouchableOpacity onPress={() => setShow(s => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={ls.inputIcon}>{show ? '👁️' : '🙈'}</Text>
              </TouchableOpacity>
            </View>

            {/* Remember me */}
            <TouchableOpacity style={ls.rememberRow} onPress={() => setRemember(r => !r)} activeOpacity={0.7}>
              <View style={[ls.checkbox, remember && ls.checkboxOn]}>
                {remember && <Text style={{ fontSize: 10, color: '#1f2937', fontWeight: '900' }}>✓</Text>}
              </View>
              <Text style={ls.rememberText}>Ingat saya</Text>
            </TouchableOpacity>

            {/* Tombol Login */}
            <TouchableOpacity
              style={[ls.btn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading
                ? <ActivityIndicator color="#1f2937" />
                : <Text style={ls.btnText}>Masuk</Text>
              }
            </TouchableOpacity>

            <View style={ls.footer}>
              <Text style={ls.footerText}>Belum punya akun? </Text>
              <Text style={[ls.footerText, { fontWeight: '700' }]}>Daftar sekarang</Text>
            </View>
            <View style={[ls.footer, { marginTop: 8 }]}>
              <Text style={[ls.footerText, { fontSize: 11, opacity: 0.75 }]}>Lupa password</Text>
              <Text style={[ls.footerText, { fontSize: 11, opacity: 0.4, marginHorizontal: 6 }]}>•</Text>
              <Text style={[ls.footerText, { fontSize: 11, opacity: 0.75 }]}>Aktivasi akun</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const ls = StyleSheet.create({
  bg:          { flex: 1, backgroundColor: '#1a3a5c' },
  scrim:       { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },
  scroll:      { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingVertical: 40 },
  card:        { width: '100%', maxWidth: 400, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingHorizontal: 28, paddingVertical: 32 },
  eyebrow:     { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' },
  title:       { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 4 },
  desc:        { fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 6, marginBottom: 24 },
  errorBox:    { backgroundColor: 'rgba(239,68,68,0.20)', borderWidth: 1, borderColor: 'rgba(252,165,165,0.35)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  errorText:   { color: '#fff', fontSize: 13 },
  inputRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 16, paddingHorizontal: 16 },
  input:       { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 14 },
  inputIcon:   { marginLeft: 8, fontSize: 16 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 10 },
  checkbox:    { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  checkboxOn:  { backgroundColor: '#fff', borderColor: '#fff' },
  rememberText:{ color: 'rgba(255,255,255,0.9)', fontSize: 14 },
  btn:         { marginTop: 20, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
  btnText:     { fontSize: 18, fontWeight: '800', color: '#1f2937' },
  footer:      { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  footerText:  { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
});

// ─── HOME SCREEN ─────────────────────────────────────────────────────────────
const EVENTS = [
  { id: '1', icon: '⛪', title: 'Kebaktian Minggu', date: '29 Jun 2026', color: '#E0F7FF' },
  { id: '2', icon: '👥', title: 'Retreat Pemuda',   date: '5 Jul 2026',  color: '#E8F5E9' },
  { id: '3', icon: '🎵', title: 'Pujian & Penyembahan', date: '12 Jul 2026', color: '#FFF3E0' },
  { id: '4', icon: '📖', title: 'Kelas Alkitab',    date: '19 Jul 2026', color: '#EDE9FE' },
];

const QUICK = [
  { id: '1', icon: '💰', label: 'Persembahan', bg: '#D1FAE5' },
  { id: '2', icon: '📅', label: 'Events',      bg: '#FEE2E2' },
  { id: '3', icon: '📚', label: 'Kelas',       bg: '#DBEAFE' },
  { id: '4', icon: '💧', label: 'Baptisan',    bg: '#CCFBF1' },
  { id: '5', icon: '💒', label: 'Pernikahan',  bg: '#FCE7F3' },
  { id: '6', icon: '🔔', label: 'Status daftar', bg: '#EDE9FE' },
];

const NEWS = [
  { id: '1', title: 'Jadwal Ibadah Bulan Juli', date: '20 Jun 2026', tag: 'Pengumuman' },
  { id: '2', title: 'Pendaftaran Kelas Pranikah Dibuka', date: '18 Jun 2026', tag: 'Kelas' },
];

function HomeScreen({ onLogout }) {
  const [tab, setTab] = useState('home');
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    await new Promise(r => setTimeout(r, 1200));
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={hs.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* AppBar */}
      <View style={hs.appbar}>
        <View style={hs.appbarLeft}>
          <View style={hs.appbarIcon}><Text style={{ fontSize: 16 }}>⛪</Text></View>
          <Text style={hs.appbarTitle}>ESC Siantan</Text>
        </View>
        <TouchableOpacity style={hs.bell} onPress={onLogout}>
          <Text style={{ fontSize: 18 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {tab === 'home' && (
        <FlatList
          data={NEWS}
          keyExtractor={item => item.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListHeaderComponent={
            <>
              {/* Welcome */}
              <View style={hs.section}>
                <Text style={hs.welcome}>Shalom, <Text style={{ color: BRAND }}>Melvin</Text> 👋</Text>
                <Text style={hs.verse}>"Firman-Nya adalah pelita bagi kakimu."</Text>
              </View>

              {/* Event carousel */}
              <View style={hs.section}>
                <View style={hs.secHeader}>
                  <Text style={hs.secTitle}>Event mendatang</Text>
                  <Text style={{ color: BRAND, fontSize: 12 }}>Semua →</Text>
                </View>
                <FlatList
                  data={EVENTS}
                  keyExtractor={i => i.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={hs.eventCard} activeOpacity={0.8}>
                      <View style={[hs.eventImgBox, { backgroundColor: item.color }]}>
                        <Text style={{ fontSize: 28 }}>{item.icon}</Text>
                      </View>
                      <Text style={hs.eventTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={hs.eventDate}>{item.date}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>

              {/* Quick grid */}
              <View style={hs.section}>
                <Text style={hs.secTitle}>Menu cepat</Text>
                <View style={hs.grid}>
                  {QUICK.map(item => (
                    <TouchableOpacity key={item.id} style={hs.gridItem} activeOpacity={0.8}>
                      <View style={[hs.gridIcon, { backgroundColor: item.bg }]}>
                        <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                      </View>
                      <Text style={hs.gridLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* News header */}
              <View style={[hs.section, { marginBottom: 0 }]}>
                <View style={hs.secHeader}>
                  <Text style={hs.secTitle}>Informasi terbaru</Text>
                  <Text style={{ color: BRAND, fontSize: 12 }}>Semua →</Text>
                </View>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={hs.newsCard} activeOpacity={0.85}>
              <View style={hs.newsTag}><Text style={hs.newsTagText}>{item.tag}</Text></View>
              <Text style={hs.newsTitle}>{item.title}</Text>
              <Text style={hs.newsDate}>{item.date}</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      {tab === 'info' && (
        <View style={hs.emptyTab}>
          <Text style={{ fontSize: 48 }}>📰</Text>
          <Text style={hs.emptyText}>Halaman Informasi</Text>
        </View>
      )}

      {tab === 'tasks' && (
        <View style={hs.emptyTab}>
          <Text style={{ fontSize: 48 }}>📋</Text>
          <Text style={hs.emptyText}>Halaman Tugas</Text>
        </View>
      )}

      {tab === 'profile' && (
        <View style={hs.emptyTab}>
          <Text style={{ fontSize: 48 }}>👤</Text>
          <Text style={hs.emptyText}>Profil Saya</Text>
          <TouchableOpacity style={hs.logoutBtn} onPress={onLogout}>
            <Text style={hs.logoutText}>Keluar (kembali ke Login)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Tab Bar */}
      <View style={hs.tabBar}>
        {[
          { key: 'home',    icon: '🏠', label: 'Beranda' },
          { key: 'info',    icon: '📰', label: 'Informasi' },
          { key: '__scan__',icon: '⊙',  label: '' },      // placeholder tengah
          { key: 'tasks',   icon: '📋', label: 'Tugas' },
          { key: 'profile', icon: '👤', label: 'Profil' },
        ].map((t, idx) => {
          if (t.key === '__scan__') {
            return (
              <View key="scan" style={hs.scanWrap}>
                <TouchableOpacity style={hs.scanBtn} activeOpacity={0.85}>
                  <Text style={{ fontSize: 22, color: '#fff' }}>⬡</Text>
                </TouchableOpacity>
              </View>
            );
          }
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={hs.tabItem}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 20, opacity: active ? 1 : 0.45 }}>{t.icon}</Text>
              <Text style={[hs.tabLabel, active && { color: BRAND }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const hs = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: '#F9FAFB' },
  appbar:      { backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  appbarLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appbarIcon:  { width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  appbarTitle: { fontSize: 16, fontWeight: '800', color: BRAND },
  bell:        { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  section:     { paddingHorizontal: 16, marginBottom: 20, marginTop: 16 },
  secHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  secTitle:    { fontSize: 14, fontWeight: '700', color: '#111827' },
  welcome:     { fontSize: 22, fontWeight: '800', color: '#111827' },
  verse:       { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },
  eventCard:   { width: 110, backgroundColor: '#fff', borderRadius: 14, padding: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  eventImgBox: { height: 60, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  eventTitle:  { fontSize: 11, fontWeight: '600', color: '#111827', lineHeight: 15 },
  eventDate:   { fontSize: 10, color: '#9CA3AF', marginTop: 3 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  gridItem:    { width: '30%', backgroundColor: '#fff', borderRadius: 14, padding: 10, alignItems: 'center', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  gridIcon:    { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  gridLabel:   { fontSize: 10, fontWeight: '600', color: '#374151', textAlign: 'center', lineHeight: 13 },
  newsCard:    { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  newsTag:     { alignSelf: 'flex-start', backgroundColor: '#E0F7FF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2, marginBottom: 6 },
  newsTagText: { fontSize: 10, color: '#0077AA', fontWeight: '700' },
  newsTitle:   { fontSize: 13, fontWeight: '700', color: '#111827', marginBottom: 4 },
  newsDate:    { fontSize: 11, color: '#9CA3AF' },
  emptyTab:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText:   { fontSize: 16, fontWeight: '600', color: '#374151' },
  logoutBtn:   { marginTop: 20, backgroundColor: '#FEE2E2', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  logoutText:  { color: '#DC2626', fontWeight: '700' },
  tabBar:      { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 20 : 8 },
  tabItem:     { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 2 },
  tabLabel:    { fontSize: 9, color: '#9CA3AF', fontWeight: '600' },
  scanWrap:    { flex: 1, alignItems: 'center', marginBottom: 12 },
  scanBtn:     { width: 52, height: 52, borderRadius: 26, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: BRAND, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, borderWidth: 3, borderColor: '#fff' },
});

// ─── ROOT APP ────────────────────────────────────────────────────────────────
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  return loggedIn
    ? <HomeScreen onLogout={() => setLoggedIn(false)} />
    : <LoginScreen onLogin={() => setLoggedIn(true)} />;
}
