import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import admin from 'firebase-admin';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith(`'`)) val = val.slice(1, -1);
    env[match[1].trim()] = val;
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('push_subscriptions').select('*');
  console.log('Subscriptions:', data?.length);
  if (!data) return;

  const fcmTokens = data.map(sub => sub.endpoint).filter(endpoint => !endpoint.startsWith('http'));
  console.log('FCM Tokens:', fcmTokens);

  if (fcmTokens.length > 0) {
    const sa = JSON.parse(fs.readFileSync('scratch/firebase-service-account.json', 'utf-8'));
    
    const { initializeApp, cert } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');

    const app = initializeApp({
      credential: cert({
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: sa.private_key,
      }),
    });
    
    const message = {
      notification: {
        title: 'ESC Siantan - Notifikasi Berhasil!',
        body: 'Selamat! FCM Push Notification di Android Anda telah berfungsi dengan sempurna.'
      },
      android: {
        notification: {
          channelId: 'fcm_default_channel'
        }
      },
      tokens: fcmTokens
    };
    
    const response = await getMessaging(app).sendEachForMulticast(message);
    console.log('Success:', response.successCount);
    if (response.failureCount > 0) {
        console.log('Errors:', response.responses.filter(r => !r.success).map(r => r.error));
    }
  } else {
    console.log('No FCM tokens found in DB.');
  }
}
run();
