/**
 * Harici Zamanlayıcı (cron-job.org) Kurulum Betiği
 * 
 * GitHub Actions'ın ücretsiz cron zamanlayıcısı saatlerce gecikebilir.
 * Bu betik, cron-job.org'dan GitHub Actions workflow_dispatch webhook'u
 * tam dakikasında tetiklemek için 2 adet cron job oluşturur.
 * 
 * Kullanım: node setup_cronjob.js
 * 
 * Not: cron-job.org'da ücretsiz hesap açıp API key almanız gerekiyor.
 * Alternatif olarak cron-job.org web arayüzünden elle kurabilirsiniz.
 */

const GITHUB_TOKEN = 'BURAYA_GITHUB_TOKENINIZI_YAZIN';
const OWNER = 'atakanbostanci';
const REPO = 'daily-finance-bulletin';

console.log(`
╔══════════════════════════════════════════════════════════════╗
║  GitHub Actions Zamanında Tetikleme Kurulumu                 ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  GitHub Actions cron zamanlayıcısı saatlerce gecikebilir.    ║
║  Çözüm: cron-job.org ücretsiz servisi ile tam saatinde       ║
║  tetikleme.                                                  ║
║                                                              ║
║  Adımlar:                                                    ║
║  1. https://cron-job.org adresine gidin                      ║
║  2. Ücretsiz hesap oluşturun                                 ║
║  3. Aşağıdaki 2 cron job'u oluşturun:                        ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  JOB 1: Türkiye Sabah Bülteni (08:00 TR = 05:00 UTC)        ║
║  ─────────────────────────────────────────────────────        ║
║  URL:                                                        ║
║  POST https://api.github.com/repos/${OWNER}/${REPO}/dispatches
║                                                              ║
║  Headers:                                                    ║
║  Authorization: token ${GITHUB_TOKEN}
║  Accept: application/vnd.github.v3+json                      ║
║  Content-Type: application/json                              ║
║                                                              ║
║  Body:                                                       ║
║  {"event_type": "morning-bulletin"}                          ║
║                                                              ║
║  Schedule: Her gün 05:00 UTC (= 08:00 TR)                   ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  JOB 2: Amerika Öğleden Sonra Bülteni (16:00 TR = 13:00 UTC)║
║  ─────────────────────────────────────────────────────        ║
║  URL:                                                        ║
║  POST https://api.github.com/repos/${OWNER}/${REPO}/dispatches
║                                                              ║
║  Headers:                                                    ║
║  Authorization: token ${GITHUB_TOKEN}
║  Accept: application/vnd.github.v3+json                      ║
║  Content-Type: application/json                              ║
║                                                              ║
║  Body:                                                       ║
║  {"event_type": "us-bulletin"}                               ║
║                                                              ║
║  Schedule: Her gün 13:00 UTC (= 16:00 TR)                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

// Test: Manually trigger both workflows right now
const https = require('https');

function triggerWorkflow(eventType) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ event_type: eventType });
    const options = {
      hostname: 'api.github.com',
      path: '/repos/' + OWNER + '/' + REPO + '/dispatches',
      method: 'POST',
      headers: {
        'User-Agent': 'NodeJS-Agent',
        'Authorization': 'token ' + GITHUB_TOKEN,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 200) {
          resolve('SUCCESS');
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  console.log('Testing repository_dispatch triggers...\n');
  
  try {
    await triggerWorkflow('morning-bulletin');
    console.log('✅ Morning bulletin (repository_dispatch) triggered successfully!');
  } catch (e) {
    console.error('❌ Morning trigger failed:', e.message);
  }

  try {
    await triggerWorkflow('us-bulletin');
    console.log('✅ US bulletin (repository_dispatch) triggered successfully!');
  } catch (e) {
    console.error('❌ US trigger failed:', e.message);
  }

  console.log('\nBoth dispatches sent. Workflows should start within 30 seconds.');
}

main();
